// netlify/functions/iban_ro.js
// Verify-style logic:
// - Validate token_iban (+ expiry) via Mailjet using EMAIL as key
// - Fetch display data via internal get_contact (server-side) using x-internal-key
// - Return readonly data for UI; never call get_contact from browser

let fetchImpl = (typeof fetch !== 'undefined') ? fetch : null;
if (!fetchImpl) { fetchImpl = require('node-fetch'); }
const fetchFn = (...args) => fetchImpl(...args);

const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

const ENFORCE_EXPIRY = (process.env.ENFORCE_EXPIRY || '0') === '1';
const CONTACT_BASE   = process.env.GET_CONTACT_BASE_URL || process.env.BASE_PUBLIC_URL || 'https://verify.sikuralife.com';
const INTERNAL_KEY   = process.env.GET_CONTACT_INTERNAL_KEY || '';

function jres(code, obj){ return { statusCode: code, headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj) }; }
function b64urlDecode(s){ if(!s) return ''; s=String(s).replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; try{return Buffer.from(s,'base64').toString('utf8')}catch{return ''} }
function toObj(arr){ return Object.fromEntries((arr||[]).map(p=>[p.Name,p.Value])); }
function safeDate(x){ const d=new Date(x); return isFinite(d)?d:null; }
function parse(event){
  const q = event.queryStringParameters || {};
  let b = {};
  const ct=(event.headers['content-type']||event.headers['Content-Type']||'').toLowerCase();
  if(ct.includes('application/json')){ try{ b = JSON.parse(event.body||'{}'); }catch{} }
  else if(event.body){ try{ const o={}; new URLSearchParams(event.body).forEach((v,k)=>o[k]=v); b=o; }catch{} }
  const id    = b.id    ?? q.id;
  const token = b.token ?? q.token;
  const em    = b.em    ?? q.em;
  const email = b.email ?? q.email;
  const lang  = (b.lang ?? q.lang ?? 'de').toLowerCase();
  return { id, token, em, email, lang, q, b };
}

async function mjGetContactIdByEmail(email){
  const r = await fetchFn(`https://api.mailjet.com/v3/REST/contact/?ContactEmail=${encodeURIComponent(email)}`, {
    headers:{ Authorization: mjAuth }
  });
  if(!r.ok){ const t=await r.text(); throw new Error(`Mailjet contact fetch failed: ${r.status} ${t}`); }
  const j = await r.json(); const id=j?.Data?.[0]?.ID;
  if(!id) throw new Error(`Mailjet contact not found for ${email}`);
  return id;
}

exports.handler = async (event) => {
  try {
    const { id, token, em, email: emailIn, lang, q, b } = parse(event);
    let email = emailIn;
    if (!email && em) email = b64urlDecode(em) || em;
    if (!email || !token) return jres(400, { ok:false, error:'Missing token/email', got:{query:q, body:b} });

    // 1) Validate token via Mailjet
    const contactId = await mjGetContactIdByEmail(email);
    const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, {
      headers:{ Authorization: mjAuth }
    });
    if(!r.ok){ const t=await r.text(); return jres(502, { ok:false, error:`Mailjet fetch failed: ${t}` }); }
    const j = await r.json(); const props = toObj(j?.Data?.[0]?.Data);
    const tokenStored = String(props.token_iban||'');
    const expiryRaw   = String(props.token_iban_expiry||props.Token_iban_expiry||'');
    if(!tokenStored) return jres(401, { ok:false, error:'Token missing' });
    if(tokenStored !== String(token)) return jres(401, { ok:false, error:'Token mismatch', got:{token}, stored:{tokenStored} });
    if(ENFORCE_EXPIRY && expiryRaw){ const exp=safeDate(expiryRaw); if(exp && exp < new Date()) return jres(410, { ok:false, error:'Token expired' }); }

    // 2) Fetch display data from internal get_contact (verify logic)
    let view = null;
    if (INTERNAL_KEY) {
      try {
        const url = `${CONTACT_BASE.replace(/\/+$/,'')}/.netlify/functions/get_contact`;
        const resp = await fetchFn(url, {
          method:'POST',
          headers:{
            'x-internal-key': INTERNAL_KEY,
            'content-type': 'application/json',
            'accept':'application/json'
          },
          body: JSON.stringify({ id, email, lang })
        });
        if (resp.ok) {
          const data = await resp.json().catch(()=>null);
          // try a few shapes
          if (data && typeof data === 'object') {
            if (data.readonly && typeof data.readonly === 'object') view = data.readonly;
            else if (data.data && typeof data.data === 'object') view = data.data;
            else view = data;
          }
        } else {
          // pass through minimal error in debug
          if (process.env.DEBUG === '1') {
            view = { __warn: `get_contact status ${resp.status}` };
          }
        }
      } catch (e) {
        if (process.env.DEBUG === '1') {
          view = { __warn: 'get_contact fetch failed' };
        }
      }
    }

    // Fallback: if no backend data, build minimal readonly from Mailjet but hide sensitive fields
    if (!view || typeof view !== 'object') {
      view = {};
      for (const [k,v] of Object.entries(props)) {
        const low = k.toLowerCase();
        if (low.includes('token')) continue;
        if (low.includes('iban')) continue;
        if (low.startsWith('ip_') || low.startsWith('agent_')) continue;
        if (v == null || typeof v === 'object') continue;
        view[k] = String(v);
      }
    }

    return jres(200, { ok:true, email, id, readonly: view });
  } catch (err) {
    if (process.env.DEBUG === '1') return jres(500, { ok:false, error:String(err?.message||err) });
    return { statusCode: 500, body: 'Server error' };
  }
};