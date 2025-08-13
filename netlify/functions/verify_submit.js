
function normalizeIBAN(i){ return String(i||'').replace(/\s+/g,'').toUpperCase(); }
function ibanChecksum(iban){
  const rearr = iban.slice(4) + iban.slice(0,4);
  const expanded = rearr.replace(/[A-Z]/g, c => (c.charCodeAt(0)-55).toString());
  let rem = 0;
  for (let i=0; i<expanded.length; i+=6) {
    rem = Number(String(rem) + expanded.substr(i,6)) % 97;
  }
  return rem;
}
function isValidIBAN(input){
  const IBAN = normalizeIBAN(input);
  const len = { CH:21, LI:21, DE:22, AT:20, IT:27, FR:27, GB:22, NL:18, BE:16 };
  if (!/^[A-Z]{2}[0-9A-Z]{12,34}$/.test(IBAN)) return false;
  const cc = IBAN.slice(0,2);
  if (len[cc] && IBAN.length !== len[cc]) return false;
  return ibanChecksum(IBAN) === 1;
}

// netlify/functions/verify_submit.js
const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

// Feature-Toggles
const ENFORCE_EXPIRY     = true;   // Token muss vor Ablauf genutzt werden
const ENFORCE_SINGLE_USE = true;   // Token darf nur 1x genutzt werden

function parseFormBody(event) {
  const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
  if (ct.includes('application/json')) {
    try { return JSON.parse(event.body || '{}'); } catch { return {}; }
  }
  try {
    const params = new URLSearchParams(event.body || '');
    const obj = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    return obj;
  } catch { return {}; }
}

function b64urlDecode(input) {
  if (!input) return '';
  let s = String(input).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  try { return Buffer.from(s, 'base64').toString('utf8'); } catch { return ''; }
}

function sanitizeHeader(s){ return String(s||'').replace(/[\r\n]+/g,' ').slice(0,200); }
function firstIpFromHeader(xff) {
  if (!xff) return '';
  return String(xff).split(',')[0].trim();
}
function sanitizeUA(ua) {
  return String(ua || '').replace(/[\u0000-\u001F]+/g, '').trim().slice(0, 255);
}

// --- Serverseitige Pflichtfeld- & PLZ-Validierung (Helper) ---
function isFilled(s) { return String(s ?? '').trim().length > 0; }
function validatePLZ(plz, country) {
  const p = String(plz || '').trim();
  const c = String(country || '').trim().toUpperCase();
  if (!p) return false;
  // CH/LI → 4-stellig
  if (c === 'CH' || c === 'LI') return /^\d{4}$/.test(p);
  // DE/IT → 5-stellig
  if (c === 'DE' || c === 'IT') return /^\d{5}$/.test(p);
  // Fallback (konservativ): 4–6 Ziffern
  return /^\d{4,6}$/.test(p);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const data = parseFormBody(event);
  let { id, token, em, email, lang, firstname, name, strasse, hausnummer, plz, ort, country, land } = data;

  if (!email && em) email = b64urlDecode(em).trim();
  if (!country && land) country = land;

  if (!id || !token || !email) {
    return { statusCode: 400, body: 'Missing required parameters (id/token/email)' };
  }

  // --- Serverseitige Pflichtfeld- & PLZ-Validierung (DSGVO/Audit) ---
  // hausnummer bleibt optional; country kann via "land" gekommen sein (oben gemappt)
  if (!isFilled(firstname) || !isFilled(name) || !isFilled(strasse) || !isFilled(plz) || !isFilled(ort) || !isFilled(country)) {
    return { statusCode: 400, body: 'Missing required address fields' };
  }
  if (!validatePLZ(plz, country)) {
    return { statusCode: 400, body: 'Invalid postal code' };
  }

  // Request-Metadaten
  const H = event.headers || {};
  const userAgent = sanitizeUA(H['user-agent'] || H['User-Agent'] || '');
  const ip =
    firstIpFromHeader(H['x-forwarded-for'] || H['X-Forwarded-For']) ||
    H['x-nf-client-connection-ip'] || H['client-ip'] || H['x-real-ip'] || 'unknown';
  const nowISO = new Date().toISOString();

  try {
    // 1) Mailjet Contact-Properties holen
    const r = await fetch(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(email)}`, {
      headers: { Authorization: mjAuth }
    });
    if (!r.ok) {
      const t = await r.text();
      return { statusCode: 502, body: `Mailjet fetch failed: ${t}` };
    }
    const json = await r.json();
    const propsArray = json.Data?.[0]?.Data || [];
    const theProps = Object.fromEntries(propsArray.map(p => [p.Name, p.Value]));

    // 2) Pflicht-Validierungen (ID/Token)
    const glaeubigerVal = (theProps['gläubiger'] ?? theProps['glaeubiger'] ?? '').toString().trim();
    const tokenVerify   = (theProps['token_verify'] || '').toString().trim();

    if (glaeubigerVal !== String(id).trim()) {
      return { statusCode: 403, body: 'ID mismatch' };
    }
    if (!tokenVerify || tokenVerify !== token) {
      return { statusCode: 403, body: 'Invalid token' };
    }

    // 3) One-Time-Use prüfen (token_verify_used_at)
    const tokenUsedAt = (theProps['token_verify_used_at'] || '').toString().trim();
    if (ENFORCE_SINGLE_USE && tokenUsedAt) {
      return { statusCode: 409, body: 'Token already used' };
    }

    // 4) Ablauf prüfen (Token_verify_expiry bevorzugt, Fallbacks möglich)
    const expiryRaw =
      theProps['Token_verify_expiry'] ||
      theProps['token_verify_expiry'] ||
      theProps['token_expiry'] ||
      '';
    if (ENFORCE_EXPIRY && expiryRaw) {
      const exp = new Date(expiryRaw);
      if (isFinite(exp) && exp < new Date()) {
        return { statusCode: 410, body: 'Token expired' };
      }
    }

    // 5) Updates vorbereiten
    const updates = [];
  updates.push({ Name:'iban', Value:String((normalizeIBAN(iban))) });
  updates.push({ Name:'iban_updated_at', Value:new Date().toISOString() });
    const setIf = (Name, v) => { if (v !== undefined && v !== null && String(v).trim() !== '') updates.push({ Name, Value: String(v) }); };
    const set    = (Name, v) => { updates.push({ Name, Value: String(v ?? '') }); };

    // Adressfelder: nur befüllte Felder überschreiben
    setIf('firstname',  firstname);
    setIf('name',       name);
    setIf('strasse',    strasse);
    setIf('hausnummer', hausnummer);
    setIf('plz',        plz);
    setIf('ort',        ort);
    setIf('country',    country);

    // Audit (IP, Timestamp, User-Agent)
    setIf('ip_verify',        ip);
    setIf('timestamp_verify', nowISO);
    setIf('agent_verify',     userAgent);

    // One-Time-Use markieren & Token/Ablauf leeren
    set('token_verify_used_at', nowISO);
    set('token_verify',  '');
    set('Token_verify_expiry', '');

    // 6) Mailjet-Update
    const put = await fetch(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: { Authorization: mjAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ Data: updates })
    });
    if (!put.ok) {
      const t = await put.text();
      return { statusCode: 502, body: `Mailjet update failed: ${t}` };
    }

    // 7) Erfolg → je nach Clienttyp JSON oder Redirect
    const isAjax = /json/i.test(event.headers['accept'] || '') ||
                   (event.headers['x-requested-with'] || '').toLowerCase() === 'fetch';
    if (isAjax) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, redirect: 'https://verify.sikuralife.com/danke.html' })
      };
    }
    return {
      statusCode: 302,
      headers: { Location: 'https://verify.sikuralife.com/danke.html' },
      body: ''
    };

  } catch (err) {
    return { statusCode: 500, body: `Server error: ${err.message}` };
  }
};
