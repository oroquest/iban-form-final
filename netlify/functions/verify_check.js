// netlify/functions/verify_check.js
const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

// Testmodus: '1' = abgelaufene Tokens werden nicht blockiert, nur Warnhinweis
const TEST_MODE = process.env.VERIFY_TEST_MODE === '1';

// ---- Helpers ----
const ALLOWED_LANG = new Set(['de','it','en']);
const normLang = (s) => ALLOWED_LANG.has((s||'').toLowerCase()) ? s.toLowerCase() : 'de';
const isValidId = (s) => /^[0-9]{1,10}$/.test(String(s||''));
const isValidToken = (s) => /^[A-Za-z0-9\-_]{8,128}$/.test(String(s||''));
const safeEqual = (a,b) => {
  const A = Buffer.from(String(a||''), 'utf8');
  const B = Buffer.from(String(b||''), 'utf8');
  if (A.length !== B.length) return false;
  return require('crypto').timingSafeEqual(A,B);
};
function b64urlDecode(input) {
  if (!input) return '';
  let s = String(input).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  try { return Buffer.from(s, 'base64').toString('utf8'); } catch { return ''; }
}
function langFromCountry(country) {
  const c = (country || '').toUpperCase();
  if (c === 'CH' || c === 'DE' || c === 'AT' || c === 'LI') return 'de';
  if (c === 'IT') return 'it';
  return 'en';
}

const messages = {
  success: {
    de: "OK",
    it: "OK",
    en: "OK"
  },
  fail: {
    de: "❌ Ungültiger oder abgelaufener Verifizierungslink.",
    it: "❌ Link di verifica non valido o scaduto.",
    en: "❌ Invalid or expired verification link."
  },
  warn: {
    de: "⚠ Hinweis: Der Link ist älter als die zulässige Gültigkeit. (Testmodus – keine Sperre)\n\n",
    it: "⚠ Avviso: Il link è più vecchio della validità consentita. (Modalità test – nessun blocco)\n\n",
    en: "⚠ Notice: The link is older than the allowed validity. (Test mode – no blocking)\n\n"
  }
};

// ---- Handler ----
exports.handler = async (event) => {
  const q = event.queryStringParameters || {};

  // aus dem Link: /?lang=de&id=<glaeubigerId>&token=<hex>&em=<b64url(email)>
  const lang   = normLang(q.lang || '');
  const id     = String(q.id || '').trim();
  const token  = String(q.token || '').trim();
  const emRaw  = String(q.em || '').trim();
  const email  = b64urlDecode(emRaw).trim().toLowerCase();

  // Eingabevalidierung
  if (!email || !isValidToken(token) || !isValidId(id)) {
    return { statusCode: 400, body: messages.fail[lang] || messages.fail.en };
  }

  try {
    // Kontakt-Properties aus Mailjet lesen
    const resp = await fetch(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(email)}`, {
      headers: { Authorization: mjAuth }
    });
    if (!resp.ok) {
      const t = await resp.text().catch(()=>'');
      return { statusCode: 502, body: `Mailjet fetch failed: ${t}` };
    }

    const body = await resp.json();
    const rows = body.Data || [];
    const dataList = rows[0]?.Data || [];
    const props = Object.fromEntries(dataList.map(d => [d.Name, d.Value]));

    // Sprache ggf. aus Country ableiten
    const effLang = normLang(lang || langFromCountry(props.country));

    // Token + ID prüfen
    const propToken = String(props['token_verify'] || '').trim();
    const propCred  = String(props['gläubiger'] ?? props['glaeubiger'] ?? '').trim();
    if (!propToken || !safeEqual(propToken, token) || propCred !== id) {
      return { statusCode: 400, body: messages.fail[effLang] || messages.fail.en };
    }

    // Ablauf prüfen (Token_verify_expiry bevorzugt; Fallbacks erlaubt)
    const expiryRaw =
      props['Token_verify_expiry'] ||
      props['token_verify_expiry'] ||
      props['token_expiry'] || '';
    if (expiryRaw) {
      const exp = new Date(expiryRaw);
      if (isFinite(exp) && exp < new Date()) {
        if (!TEST_MODE) {
          return { statusCode: 410, body: messages.fail[effLang] || messages.fail.en };
        }
        // TEST_MODE: nur warnen, nicht blocken
        return { statusCode: 200, body: (messages.warn[effLang] || messages.warn.en) + (messages.success[effLang] || "OK") };
      }
    }

    // *** WICHTIG: HIER NICHT MEHR TOKEN LEEREN! ***
    // Früher wurden token_verify/link_verify beim Check gelöscht (Prefill brach danach).
    // Verbrauch passiert erst in verify_submit.js nach Formular-Absenden. 

    // Erfolg
    return { statusCode: 200, body: messages.success[effLang] || "OK" };

  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e.message}` };
  }
};
