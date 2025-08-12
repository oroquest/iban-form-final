// netlify/functions/iban_check.js
let fetchImpl = (typeof fetch !== 'undefined') ? fetch : null;
if (!fetchImpl) { fetchImpl = require('node-fetch'); }
const fetchFn = (...args) => fetchImpl(...args);

const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

const ENFORCE_EXPIRY = true;

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
  try{
    const q = event.queryStringParameters || {};
    let { id, token, em, email } = q;
    if(!email && em) email = b64urlDecode(em).trim();
    if(!email || !token) return { statusCode:400, body:'Missing token/email' };

    const contactId = await mjGetContactIdByEmail(email);

    const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, {
      headers:{ Authorization: mjAuth }
    });
    if(!r.ok){ const t = await r.text(); return { statusCode:502, body:`Mailjet fetch failed: ${t}` }; }

    const j = await r.json();
    const props = normalizePairs(j?.Data?.[0]?.Data);

    // Tokenprüfung (IBAN)
    const tokenStored = String(props.token_iban||'');
    const expiryRaw   = String(props.token_iban_expiry||props.Token_iban_expiry||'');
    if(!tokenStored) return { statusCode:401, body:'Token missing' };
    if(tokenStored !== String(token)) return { statusCode:401, body:'Token mismatch' };
    if(ENFORCE_EXPIRY && expiryRaw){
      const exp = new Date(expiryRaw);
      if(isFinite(exp) && exp < new Date()) return { statusCode:410, body:'Token expired' };
    }

    // readonly: alles außer sensiblen Feldern ausblenden
    const readonly = {};
    for (const [k,v] of Object.entries(props)) {
      const low = k.toLowerCase();
      if (low.includes('token')) continue;
      if (low.includes('iban')) continue;
      if (low.startsWith('ip_') || low.startsWith('agent_')) continue;
      if (v == null || typeof v === 'object') continue;
      readonly[k] = String(v);
    }

    return {
      statusCode:200,
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        ok:true,
        email,
        id,
        readonly,
        props_all: props   // Fallback fürs Frontend
      })
    };
  }catch(err){
    const debug = process.env.DEBUG === '1';
    return debug
      ? { statusCode:500, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err?.message||err) }) }
      : { statusCode:500, body:'Server error' };
  }
};