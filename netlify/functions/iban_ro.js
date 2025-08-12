// netlify/functions/iban_ro.js
// Server-side proxy to fetch readonly customer data via internal get_contact function,
// but ONLY after validating the IBAN token. This avoids exposing the internal key to the browser.

let fetchImpl = (typeof fetch !== 'undefined') ? fetch : null;
if (!fetchImpl) { fetchImpl = require('node-fetch'); }
const fetchFn = (...args) => fetchImpl(...args);

const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

const INTERNAL_KEY = process.env.GET_CONTACT_INTERNAL_KEY;
const BASE_URL     = process.env.BASE_PUBLIC_URL || '';

function b64urlDecode(s){ if(!s) return ''; s=String(s).replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; try {return Buffer.from(s,'base64').toString('utf8')}catch{return ''} }
function normalizePairs(arr){ return Object.fromEntries((arr||[]).map(p=>[p.Name, p.Value])); }

async function mjGetContactIdByEmail(email) {
  const r = await fetchFn(`https://api.mailjet.com/v3/REST/contact/?ContactEmail=${encodeURIComponent(email)}`, {
    headers: { Authorization: mjAuth }
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`Mailjet contact fetch failed: ${r.status} ${t}`); }
  const j = await r.json();
  const id = j?.Data?.[0]?.ID;
  if (!id) throw new Error(`Mailjet contact not found for ${email}`);
  return id;
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    let { id, token, em, email } = q;
    if(!email && em) email = b64urlDecode(em).trim();
    if(!email || !token) return { statusCode:400, body:'Missing token/email' };
    if(!INTERNAL_KEY) return { statusCode:500, body:'Missing ENV GET_CONTACT_INTERNAL_KEY' };
    if(!BASE_URL) return { statusCode:500, body:'Missing ENV BASE_PUBLIC_URL' };

    // Validate token using Mailjet contactdata (IBAN)
    const contactId = await mjGetContactIdByEmail(email);
    const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, {
      headers:{ Authorization: mjAuth }
    });
    if(!r.ok){ const t = await r.text(); return { statusCode:502, body:`Mailjet fetch failed: ${t}` }; }
    const j = await r.json();
    const props = normalizePairs(j?.Data?.[0]?.Data);

    const tokenStored = String(props.token_iban||'');
    const expiryRaw   = String(props.token_iban_expiry||props.Token_iban_expiry||'');

    if(!tokenStored) return { statusCode:401, body:'Token missing' };
    if(tokenStored !== String(token)) return { statusCode:401, body:'Token mismatch' };
    if(expiryRaw){
      const exp = new Date(expiryRaw);
      if(isFinite(exp) && exp < new Date()) return { statusCode:410, body:'Token expired' };
    }

    // After validation, call internal get_contact
    const url = `${BASE_URL}/.netlify/functions/get_contact?id=${encodeURIComponent(id)}&email=${encodeURIComponent(email)}`;
    const gc = await fetchFn(url, { headers: { 'x-internal-key': INTERNAL_KEY } });
    if (!gc.ok) {
      const t = await gc.text();
      // Fallback to props if internal endpoint denies
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok:true, email, id, readonly: {}, props_all: props, note: `fallback_props_all (get_contact: ${gc.status})` })
      };
    }
    const data = await gc.json().catch(()=>null);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok:true, email, id, readonly: data||{}, props_all: props })
    };
  } catch (err) {
    const debug = process.env.DEBUG === '1';
    return debug
      ? { statusCode:500, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err?.message||err) }) }
      : { statusCode:500, body:'Server error' };
  }
};