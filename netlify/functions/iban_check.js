// netlify/functions/iban_check.js

let fetchImpl = (typeof fetch !== 'undefined') ? fetch : null;
if (!fetchImpl) { fetchImpl = require('node-fetch'); }
const fetchFn = (...args) => fetchImpl(...args);

const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');
const ENFORCE_EXPIRY = true;

function debugResponse(status, err) {
  if (process.env.DEBUG === '1') {
    return {
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok:false, error: String(err && err.message || err), stack: String(err && err.stack || '') })
    };
  }
  return { statusCode: status, body: 'Server error' };
}

function b64urlDecode(s){ if(!s) return ''; s=String(s).replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; try {return Buffer.from(s,'base64').toString('utf8')}catch{return ''} }
exports.handler = async (event) => {
  try{
    const q = event.queryStringParameters || {};
    let { id, token, em, email } = q;
    if(!email && em) email = b64urlDecode(em).trim();
    if(!email || !token) return { statusCode:400, body:'Missing token/email' };
    const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(email)}`, { headers:{ Authorization: mjAuth } });
    if(!r.ok) return debugResponse(502, new Error('Mailjet fetch failed'));
    const j = await r.json();
    const propsArr = (j && j.Data && j.Data[0] && j.Data[0].Data) ? j.Data[0].Data : [];
    const props = Object.fromEntries(propsArr.map(p=>[p.Name,p.Value]));
    const tokenStored = String(props.token_iban||'');
    const expiryRaw   = String(props.token_iban_expiry||props.Token_iban_expiry||'');
    if(!tokenStored) return { statusCode:401, body:'Token missing' };
    if(tokenStored !== String(token)) return { statusCode:401, body:'Token mismatch' };
    if(ENFORCE_EXPIRY && expiryRaw){ const exp = new Date(expiryRaw); if(isFinite(exp) && exp < new Date()) return { statusCode:410, body:'Token expired' }; }
    const readonly = {};
    for (const [k,v] of Object.entries(props)) {
      const key = String(k || '');
      const lower = key.toLowerCase();
      if (lower.includes('iban') || lower.includes('token')) continue;
      if (lower.includes('ip_verify') || lower.includes('agent_verify')) continue;
      if (['timestamp_verify','token_verify_used_at','token_verify_expiry','token_verify'].includes(lower)) continue;
      if (v == null) continue;
      if (typeof v === 'object') continue;
      readonly[key] = String(v);
    }
    const payload = { email, readonly };
    return { statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) };
  }catch(err){ return debugResponse(500, err); }
};
