// netlify/functions/iban_submit.js
// Uses native fetch. Validates IBAN (Mod-97), single-use token.

function sanitizeIban(s){ return String(s||'').toUpperCase().replace(/\s+/g,''); }
function ibanIsValid(raw){
  const s = sanitizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const rearr = s.slice(4)+s.slice(0,4);
  let rem=0, buf='';
  for (const ch of rearr){
    const code = ch.charCodeAt(0);
    if (code>=48&&code<=57) buf+=ch; else if (code>=65&&code<=90) buf+=String(code-55); else return false;
    while (buf.length>=7){ rem = Number(String(rem)+buf.slice(0,7)) % 97; buf = buf.slice(7); }
  }
  if (buf.length) rem = Number(String(rem)+buf) % 97;
  return rem===1;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const isJson = (event.headers['content-type']||'').includes('application/json');
    const body = isJson ? JSON.parse(event.body||'{}') : Object.fromEntries(new URLSearchParams(event.body||''));

    const id     = String(body.id||'').trim();
    const token  = String(body.token||'').trim();
    const iban   = sanitizeIban(body.iban||'');
    const bic    = String(body.bic||'').toUpperCase().trim();
    const name   = String(body.glaeubiger||body.name||'').trim();
    const lang   = String(body.lang||'de').toLowerCase();
    const email  = Buffer.from(String(body.em||''), 'base64url').toString('utf8');

    if (!email || !id || !token || !iban) return { statusCode: 400, body: 'Missing fields' };
    if (!ibanIsValid(iban)) return { statusCode: 422, body: 'Invalid IBAN' };
    if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) return { statusCode: 422, body: 'Invalid BIC' };

    const mjAuth = 'Basic ' + Buffer.from(`${process.env.MJ_APIKEY_PUBLIC}:${process.env.MJ_APIKEY_PRIVATE}`).toString('base64');
    const mjBase = 'https://api.mailjet.com';

    const cRes = await fetch(`${mjBase}/v3/REST/contact?Email=${encodeURIComponent(email)}`, { headers: { Authorization: mjAuth } });
    const cJson = await cRes.json();
    if (!cRes.ok || !cJson?.Data?.length) return { statusCode: 404, body: 'contact_not_found' };
    const contactId = cJson.Data[0].ID;

    const cdRes = await fetch(`${mjBase}/v3/REST/contactdata/${contactId}`, { headers: { Authorization: mjAuth } });
    const cdJson = await cdRes.json();
    const props = {}; if (cdJson?.Data?.[0]?.Data) for (const kv of cdJson.Data[0].Data) props[kv.Name]=kv.Value;

    // Token checks
    if (props.token_iban !== token) return { statusCode: 403, body: 'Invalid token' };
    const expiryTs = new Date(props.token_iban_expiry || 0).getTime();
    const testMode = String(process.env.IBAN_TEST_MODE||'0') === '1';
    if (Date.now() > expiryTs && !testMode) return { statusCode: 410, body: 'Token expired' };
    if (props.token_iban_used_at) return { statusCode: 409, body: 'Token already used' };

    // ID hardening (like Verify)
    const ids = [props.glaeubiger, props.glaeubiger_nr, props.creditor_id, props.id].filter(Boolean).map(String);
    if (ids.length && !ids.includes(String(id))) return { statusCode: 403, body: 'ID mismatch' };

    const ts = new Date().toISOString();
    const Data = [
      { Name:'iban',               Value: iban },
      { Name:'glaeubiger',         Value: name },
      { Name:'bic',                Value: bic },
      { Name:'ip_iban',            Value: (event.headers['x-forwarded-for']||'').split(',')[0].trim() },
      { Name:'agent_iban',         Value: event.headers['user-agent']||'' },
      { Name:'timestamp_iban',     Value: ts },
      { Name:'token_iban',         Value: '' },
      { Name:'token_iban_expiry',  Value: '' },
      { Name:'token_iban_used_at', Value: ts },
      { Name:'iban_status',        Value: 'submitted' }
    ];
    const uRes = await fetch(`${mjBase}/v3/REST/contactdata/${contactId}`, {
      method: 'PUT', headers: { Authorization: mjAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ Data })
    });
    if (!uRes.ok) return { statusCode: uRes.status, body: `mailjet_update_failed:${await uRes.text()}` };

    return { statusCode: 302, headers: { Location: '/danke.html' }, body: '' };
  } catch (e) {
    return { statusCode: 500, body: `error:${e.message}` };
  }
};
