
// netlify/functions/iban_check.js — parse token/id/email from body, query, or referer
exports.handler = async function(event) {
  const q = event.queryStringParameters || {};
  let b = {};
  const ct = (event.headers['content-type']||event.headers['Content-Type']||'').toLowerCase();
  if (ct.includes('application/json')) {
    try { b = JSON.parse(event.body||'{}'); } catch {}
  } else if (event.body) {
    try { const o={}; new URLSearchParams(event.body).forEach((v,k)=>o[k]=v); b=o; } catch {}
  }

  let id    = b.id    ?? q.id;
  let token = b.token ?? q.token;
  let em    = b.em    ?? q.em;
  let email = b.email ?? q.email;
  let lang  = (b.lang ?? q.lang ?? 'de').toLowerCase();

  // Fallback: Referer
  if ((!id || !token || (!em && !email)) && (event.headers.referer || event.headers.Referer)) {
    try {
      const ref = event.headers.referer || event.headers.Referer;
      const u = new URL(ref);
      const rqs = u.searchParams;
      id    = id    || rqs.get('id');
      token = token || rqs.get('token');
      em    = em    || rqs.get('em');
      lang  = lang  || (rqs.get('lang') || 'de').toLowerCase();
    } catch {}
  }

  if (!email && em) {
    try {
      email = Buffer.from(em.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    } catch {
      email = em;
    }
  }

  if (!email || !token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ ok:false, error:'Missing token/email', got:{ query:q, body:b } })
    };
  }

  // --- Hier kommt deine bestehende Token-Prüfung und Mailjet-Lese-Logik ---
  // Dummy response für Test:
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      email,
      id,
      readonly: { firstname: "Test", lastname: "User", strasse: "Musterweg", hausnummer: "1", plz: "8000", ort: "Zürich", country: "CH" }
    })
  };
};
