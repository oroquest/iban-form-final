// netlify/functions/send_iban_email.js
// Generates token_iban + token_iban_expiry, stores on Mailjet contact, and sends email with link to /iban.html
// Batch-compatible response (templateId, expiresAt, url). Uses DE/EN + DIRECT/LAWYER template envs.

const crypto = require('crypto');

const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

const BASE_URL = process.env.BASE_PUBLIC_URL || 'https://verify.sikuralife.com';
const EXPIRY_DAYS = parseInt(process.env.IBAN_TOKEN_DAYS || '7', 10);

// Templates per language & category (DIRECT/LAWYER) — align with verify naming
const TPL = {
  de: {
    direct: Number(process.env.TEMPLATE_DE_IBAN_DIRECT || 0),
    lawyer: Number(process.env.TEMPLATE_DE_IBAN_LAWYER || 0)
  },
  en: {
    direct: Number(process.env.TEMPLATE_EN_IBAN_DIRECT || 0),
    lawyer: Number(process.env.TEMPLATE_EN_IBAN_LAWYER || 0)
  }
};

function b64url(input) {
  return Buffer.from(input, 'utf8').toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function pickLang(x) {
  const s = String(x || 'de').toLowerCase();
  return (s === 'en') ? 'en' : 'de'; // only DE/EN for IBAN
}
function pickTemplate(lang, category) {
  const l = pickLang(lang);
  const c = String(category || 'direct').toLowerCase();
  const group = TPL[l] || TPL.de;
  // normalize: allow 'lawyer' or anything else default to 'direct'
  const key = c.includes('lawyer') ? 'lawyer' : 'direct';
  return group[key] || group.direct || 0;
}
function parseBody(event) {
  const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
  if (ct.includes('application/json')) {
    try { return JSON.parse(event.body || '{}'); } catch { return {}; }
  }
  try {
    const o = {};
    new URLSearchParams(event.body || '').forEach((v,k)=>o[k]=v);
    return o;
  } catch { return {}; }
}
function addDays(d, n) {
  const t = new Date(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t;
}
function iso(d) { return new Date(d).toISOString(); }

async function mjUpdateContactDataByEmail(email, kv) {
  const Data = Object.entries(kv).map(([Name, Value]) => ({ Name, Value: String(Value ?? '') }));
  const r = await fetch(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(email)}`, {
    method: 'PUT',
    headers: { Authorization: mjAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Data })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Mailjet contactdata update failed: ${r.status} ${t}`);
  }
}

async function mjSendTemplateMail({ toEmail, templateId, variables }) {
  if (!templateId || Number(templateId) === 0) return; // no-op if not configured
  const r = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: { Authorization: mjAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Messages: [{
        From: { Email: process.env.MJ_FROM_EMAIL, Name: process.env.MJ_FROM_NAME || 'Support' },
        To: [{ Email: toEmail }],
        TemplateID: Number(templateId),
        TemplateLanguage: true,
        Variables: variables || {}
      }]
    })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Mailjet send failed: ${r.status} ${t}`);
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const body = parseBody(event);
    const email = String(body.email || '').trim();
    const id    = String(body.id || '').trim();
    const lang  = pickLang(body.lang);
    const category = String(body.category || '').trim();

    if (!email || !id) return { statusCode: 400, body: 'Missing email or id' };

    // 1) Token generieren + Expiry setzen
    const token = crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
    const expiresAt = addDays(new Date(), EXPIRY_DAYS);
    const expiresISO = iso(expiresAt);

    // 2) Contact-Felder aktualisieren (exakt wie vorgegeben)
    await mjUpdateContactDataByEmail(email, {
      token_iban: token,
      token_iban_expiry: expiresISO,
      token_iban_used_at: '' // reset
    });

    // 3) Link bauen: /iban.html?id=...&token=...&em=...&lang=...
    const em = b64url(email);
    const url = `${BASE_URL}/iban.html?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&em=${encodeURIComponent(em)}&lang=${encodeURIComponent(lang)}`;

    // 4) Template wählen und Mail senden (falls Template-IDs gesetzt)
    const templateId = pickTemplate(lang, category);
    await mjSendTemplateMail({
      toEmail: email,
      templateId,
      variables: { url, id, lang, category }
    });

    // 5) Response für Batch
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, templateId: templateId || 0, expiresAt: expiresISO, url })
    };

  } catch (err) {
    return { statusCode: 500, body: `Server error: ${err.message}` };
  }
};
