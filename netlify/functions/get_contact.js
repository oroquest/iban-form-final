// netlify/functions/get_contact.js
const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

const INTERNAL_KEY = process.env.GET_CONTACT_INTERNAL_KEY || ""; // Server-zu-Server-Schlüssel
const REQUIRE_AUTH = true; // ohne internen Key müssen id+token geprüft werden

const ALLOW_ORIGINS = new Set([
  'https://verify.sikuralife.com',
  'https://sikuralife.com'
]);

function pickOrigin(o){ return ALLOW_ORIGINS.has(o||'') ? o : 'https://verify.sikuralife.com'; }
function cors(origin='https://verify.sikuralife.com') {
  return {
    'Access-Control-Allow-Origin': pickOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Internal-Key'
  };
}

function hasInternalAuth(headers) {
  const h = headers || {};
  const k = h['x-internal-key'] || h['X-Internal-Key'];
  return Boolean(INTERNAL_KEY && k && k === INTERNAL_KEY);
}

// Base64URL -> UTF-8
function b64urlDecode(input) {
  if (!input) return '';
  let s = String(input).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  try { return Buffer.from(s, 'base64').toString('utf8'); } catch { return ''; }
}

// Query-Param aus URL-String lesen
function queryFromUrl(url, key) {
  try { return new URL(url).searchParams.get(key) || ''; }
  catch { return ''; }
}

exports.handler = async (event) => {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || undefined;
  const referer = (event.headers && (event.headers.referer || event.headers.Referer)) || '';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors(origin), body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: cors(origin), body: 'Method Not Allowed' };
  }

  const p = event.queryStringParameters || {};

  // ---- Email ermitteln: ?email=... ODER ?em=... ODER aus Referer ----
  let email = String(p.email || '').trim().toLowerCase();
  if (!email && p.em) email = b64urlDecode(String(p.em)).trim().toLowerCase();
  if (!email && referer) {
    const emRef = queryFromUrl(referer, 'em');
    const emailRef = queryFromUrl(referer, 'email');
    if (emRef) email = b64urlDecode(emRef).trim().toLowerCase();
    else if (emailRef) email = emailRef.trim().toLowerCase();
  }

  // ---- Token ermitteln: ?token=... ODER aus Referer ----
  let token = String(p.token || '').trim();
  if (!token && referer) token = queryFromUrl(referer, 'token') || '';

  // ---- (optionale) Gläubiger-ID: direkt ODER aus Referer ----
  let credId = String(p.glaeubiger || p['gläubiger'] || p.cid || p.idnum || '').trim();
  if (!credId && p.id) credId = String(p.id).trim();
  if (!credId && referer) credId = queryFromUrl(referer, 'id') || '';

  if (!email) {
    return { statusCode: 400, headers: cors(origin), body: 'missing email' };
  }

  try {
    // Kontakt laden
    const r = await fetch(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(email)}`, {
      headers: { Authorization: mjAuth }
    });
    if (!r.ok) {
      const t = await r.text();
      return { statusCode: 502, headers: cors(origin), body: `Mailjet fetch failed: ${t}` };
    }
    const json = await r.json();
    const props = Object.fromEntries((json.Data?.[0]?.Data || []).map(pp => [pp.Name, pp.Value]));

    // ---- Autorisierung: interner Header ODER (id+token) prüfen ----
    let authorized = false;

    if (hasInternalAuth(event.headers)) {
      authorized = true; // server-zu-Server (z. B. send_verify_email)
    } else if (REQUIRE_AUTH && token) {
      const propToken = String(props['token_verify'] || '').trim();
      const propCred  = String(props['gläubiger'] ?? props['glaeubiger'] ?? '').trim();

      // Ablauf prüfen (falls vorhanden)
      const expiryRaw = props['Token_verify_expiry'] || props['token_verify_expiry'] || props['token_expiry'] || '';
      if (expiryRaw) {
        const exp = new Date(expiryRaw);
        if (isFinite(exp) && exp < new Date()) {
          return { statusCode: 410, headers: cors(origin), body: 'Token expired' };
        }
      }

      if (propToken && propToken === token) {
        // wenn eine echte Gläubiger-ID mitgeschickt wurde, muss sie passen
        if (!credId || credId === propCred) {
          authorized = true;
        }
      }
    }

    if (!authorized) {
      return { statusCode: 403, headers: cors(origin), body: 'auth required' };
    }

    // ---- Nur wenn autorisiert: Daten fürs Frontend zurückgeben ----
    const data = {
      glaeubiger: props['gläubiger'] ?? props['glaeubiger'] ?? '',
      firstname:  props['firstname']  ?? '',
      name:       props['name']       ?? '',
      strasse:    props['strasse']    ?? '',
      hausnummer: props['hausnummer'] ?? '',
      plz:        props['plz']        ?? '',
      ort:        props['ort']        ?? '',
      country:    props['country']    ?? ''
    };

    return {
      statusCode: 200,
      headers: {
        ...cors(origin),
        'Content-Type': 'application/json',
        'Vary': 'Origin, X-Internal-Key, Referer'
      },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 500, headers: cors(origin), body: 'server error: ' + e.message };
  }
};
