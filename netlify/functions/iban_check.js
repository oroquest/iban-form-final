// netlify/functions/iban_check.js
let fetchImpl = (typeof fetch !== 'undefined') ? fetch : null;
if (!fetchImpl) { fetchImpl = require('node-fetch'); }
const fetchFn = (...args) => fetchImpl(...args);

const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

function jres(code, obj){ return { statusCode: code, headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj) }; }

const ENFORCE_EXPIRY = (process.env.ENFORCE_EXPIRY||'0') === '1';

function b64urlDecode(s){ if(!s) return ''; s=String(s).replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; try{return Buffer.from(s,'base64').toString('utf8')}catch{return ''} }
function parse(event){
  const q = event.queryStringParameters||{};
  let b={}; const ct=(event.headers['content-type']||event.headers['Content-Type']||'').toLowerCase();
  if(ct.includes('application/json')){ try{b=JSON.parse(event.body||'{}')}catch{} }
  else if(event.body){ try{ const o={}; new URLSearchParams(event.body).forEach((v,k)=>o[k]=v); b=o; }catch{} }
  return { q, b };
}
function normVal(a,b){ return (a!=null && a!=='')?a: b; }
function safeDate(x){ const d = new Date(x); return isFinite(d)?d:null; }
function toObj(arr){ return Object.fromEntries((arr||[]).map(p=>[p.Name,p.Value])); }

async function mjGetContactIdByEmail(email){
  const r = await fetchFn(`https://api.mailjet.com/v3/REST/contact/?ContactEmail=${encodeURIComponent(email)}`, { headers: { Authorization: mjAuth } });
  if(!r.ok){ const t=await r.text(); throw new Error(`Mailjet contact fetch failed: ${r.status} ${t}`); }
  const j = await r.json(); const id = j?.Data?.[0]?.ID; if(!id) throw new Error(`Mailjet contact not found for ${email}`); return id;
}

exports.handler = async (event)=>{
  try{
    const { q, b } = parse(event);
    let id = normVal(q.id, b.id);
    let token = (normVal(q.token, b.token)||'').trim();
    let em = normVal(q.em, b.em);
    let email = normVal(q.email, b.email);
    const lang = (normVal(q.lang, b.lang)||'de').toLowerCase();

    if(!email && em) email = b64urlDecode(em) || em;

    if(!email || !token) return jres(400, { ok:false, error:'Missing token/email', got:{ query:q, body:b } });

    const contactId = await mjGetContactIdByEmail(email);
    const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, { headers:{ Authorization: mjAuth } });
    if(!r.ok){ const t=await r.text(); return jres(502, { ok:false, error:`Mailjet fetch failed: ${t}` }); }
    const j = await r.json();
    const props = toObj(j?.Data?.[0]?.Data);

    const tokenStored = String(props.token_iban||'').trim();
    const expiryRaw   = String(props.token_iban_expiry||props.Token_iban_expiry||'').trim();

    if(!tokenStored) return jres(401, { ok:false, error:'Token missing' });
    if(tokenStored !== token){
      if(process.env.DEBUG==='1'){
        return jres(401, { ok:false, error:'Token mismatch', got:{ token }, stored:{ tokenStored, expiryRaw } });
      }
      return jres(401, { ok:false, error:'Token mismatch' });
    }
    if(ENFORCE_EXPIRY && expiryRaw){ const exp=safeDate(expiryRaw); if(exp && exp < new Date()) return jres(410, { ok:false, error:'Token expired' }); }

    const readonly={};
    for(const [k,v] of Object.entries(props)){ const low=k.toLowerCase(); if(low.includes('token')||low.includes('iban')||low.startsWith('ip_')||low.startsWith('agent_')) continue; if(v==null||typeof v==='object') continue; readonly[k]=String(v);}

    return jres(200, { ok:true, email, id, readonly, props_all: props });
  }catch(err){
    if(process.env.DEBUG==='1'){
      return jres(500, { ok:false, error:String(err && err.message || err) });
    }
    return { statusCode:500, body:'Server error' };
  }
};