// netlify/functions/issue_token.js
// Creates a verify token, sets 7-day expiry in Mailjet, optionally sends email with the link.
// Env vars required:
//   MJ_APIKEY_PUBLIC, MJ_APIKEY_PRIVATE
// Optional env vars:
//   BASE_VERIFY_URL            (default: https://verify.sikuralife.com/)
//   MAIL_FROM_ADDRESS, MAIL_FROM_NAME
//
// POST body (JSON or x-www-form-urlencoded):
//   email  (required)  -> contact email in Mailjet
//   id     (required)  -> creditor number
//   lang   (optional)  -> de|it|en (default: de)
//   name   (optional)  -> recipient name for email
//   send   (optional)  -> "1" | "true" to send email via Mailjet
//
// Response: { ok, token, expiresAt, url, sent? }
const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

const BASE_VERIFY_URL = (process.env.BASE_VERIFY_URL || 'https://verify.sikuralife.com/').replace(/\/+$/,'');
const MAIL_FROM_ADDRESS = process.env.MAIL_FROM_ADDRESS || 'no-reply@sikuralife.com';
const MAIL_FROM_NAME    = process.env.MAIL_FROM_NAME    || 'SIKURA';

function parseBody(event) {
  const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
  if (ct.includes('application/json')) {
    try { return JSON.parse(event.body || '{}'); } catch { return {}; }
  }
  try {
    const params = new URLSearchParams(event.body || '');
    return Object.fromEntries(params.entries());
  } catch {
    return {};
  }
}

function b64url(str) {
  return Buffer.from(String(str), 'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function randomToken(byteLen = 16) {
  const crypto = require('crypto');
  return crypto.randomBytes(byteLen).toString('hex'); // 32 hex chars
}

async function setTokenInMailjet(email, token, expiresAtISO) {
  const updates = [
    { Name: 'token_verify',           Value: token },
    { Name: 'Token_verify_expiry',    Value: expiresAtISO },
    { Name: 'token_verify_used_at',   Value: '' } // reset single-use marker
  ];
  const res = await fetch(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(email)}`, {
    method: 'PUT',
    headers: { Authorization: mjAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Data: updates })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Mailjet update failed: ${res.status} ${t}`);
  }
}

function subjectByLang(lang) {
  const map = {
    de: 'Bitte Adresse bestätigen',
    it: 'Conferma del tuo indirizzo',
    en: 'Please confirm your address'
  };
  return map[lang] || map.de;
}

function textByLang(lang, url) {
  const map = {
    de: `Bitte klicken Sie auf folgenden Link, um Ihre Adresse zu bestätigen:\n\n${url}\n\nDer Link ist 7 Tage gültig.`,
    it: `Clicca sul seguente link per confermare il tuo indirizzo:\n\n${url}\n\nIl link è valido per 7 giorni.`,
    en: `Please click the link below to confirm your address:\n\n${url}\n\nThe link is valid for 7 days.`,
  };
  return map[lang] || map.de;
}

async function sendMailjet(toEmail, toName, verifyUrl, lang) {
  const res = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: { Authorization: mjAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Messages: [{
        From: { Email: MAIL_FROM_ADDRESS, Name: MAIL_FROM_NAME },
        To:   [{ Email: toEmail, Name: toName || '' }],
        Subject: subjectByLang(lang),
        TextPart: textByLang(lang, verifyUrl)
      }]
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Mailjet send failed: ${res.status} ${t}`);
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const body = parseBody(event);
    const email = String(body.email || '').trim().toLowerCase();
    const id    = String(body.id || '').trim();
    const lang  = String((body.lang || 'de')).toLowerCase();
    const name  = String(body.name || '').trim();
    const send  = String(body.send || '').toLowerCase();
    if (!email || !id) {
      return { statusCode: 400, body: 'missing email or id' };
    }

    // Generate token & 7-day expiry
    const token = randomToken(16);
    const expiresAt = new Date(Date.now() + 7*24*60*60*1000).toISOString();

    // Persist in Mailjet
    await setTokenInMailjet(email, token, expiresAt);

    // Build verify URL
    const em = b64url(email);
    const url = `${BASE_VERIFY_URL}/?lang=${encodeURIComponent(lang)}&id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&em=${encodeURIComponent(em)}`;

    let sent = false;
    if (send === '1' || send === 'true') {
      await sendMailjet(email, name, url, lang);
      sent = true;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, token, expiresAt, url, sent })
    };
  } catch (err) {
    return { statusCode: 500, body: `server error: ${err.message}` };
  }
};
