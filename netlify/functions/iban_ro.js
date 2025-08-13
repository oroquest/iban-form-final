
// netlify/functions/iban_ro.js — STRICT ID ENFORCEMENT
// Flow: validate token via Mailjet -> fetch get_contact by ID -> if returned ID != requested ID => 409 error
let fetchImpl = (typeof fetch !== 'undefined') ? fetch : null;
if (!fetchImpl) { fetchImpl = require('node-fetch'); }
const fetchFn = (...args) => fetchImpl(...args);

const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

const ENFORCE_EXPIRY = (process.env.ENFORCE_EXPIRY || '0') === '1';
const GET_CONTACT_BASE_URL = process.env.GET_CONTACT_BASE_URL || 'https://verify.sikuralife.com';
const INTERNAL_KEY = process.env.GET_CONTACT_INTERNAL_KEY;

function jres(code, obj){ return { statusCode: code, headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj) }; }
function b64urlDecode(s){ if(!s) return ''; s=String(s).replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; try{return Buffer.from(s,'base64').toString('utf8')}catch{return ''} }
function safeDate(x){ const d=new Date(x); return isFinite(d)?d:null; }

function parseInputs(event){
  const q = event.queryStringParameters || {};
  let b = {};
  const ct = (event.headers['content-type']||event.headers['Content-Type']||'').toLowerCase();
  if (ct.includes('application/json')) { try{ b = JSON.parse(event.body||'{}'); }catch{} }
  else if (event.body) { try{ const o={}; new URLSearchParams(event.body).forEach((v,k)=>o[k]=v); b=o; }catch{} }

  let id    = b.id    ?? q.id;
  let token = b.token ?? q.token;
  let em    = b.em    ?? q.em;
  let email = b.email ?? q.email;
  let lang  = (b.lang ?? q.lang ?? 'de').toLowerCase();

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
  return { id, token, em, email, lang, q, b };
}

function toObj(arr){ return Object.fromEntries((arr||[]).map(p=>[p.Name,p.Value])); }

async function mjGetContactIdByEmail(email){
  const r = await fetchFn(`https://api.mailjet.com/v3/REST/contact/?ContactEmail=${encodeURIComponent(email)}`, {
    headers:{ Authorization: mjAuth }
  });
  if(!r.ok){ const t=await r.text(); throw new Error(`Mailjet contact fetch failed: ${r.status} ${t}`); }
  const j = await r.json();
  const id = j?.Data?.[0]?.ID;
  if(!id) throw new Error(`Mailjet contact not found for ${email}`);
  return id;
}

exports.handler = async (event) => {
  try {
    const { id, token, em, email: emailIn, lang, q, b } = parseInputs(event);
    let email = emailIn;
    if (!email && em) email = b64urlDecode(em) || em;

    if (!email || !token || !id) return jres(400, { ok:false, error:'Missing id/token/email', got:{ query:q, body:b } });

    // 1) Validate token via Mailjet
    const contactId = await mjGetContactIdByEmail(email);
    const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, {
      headers:{ Authorization: mjAuth }
    });
    if(!r.ok){ const t=await r.text(); return jres(502, { ok:false, error:`Mailjet fetch failed: ${t}` }); }
    const j = await r.json();
    const props = toObj(j?.Data?.[0]?.Data);
    const tokenStored = String(props.token_iban||'');
    const expiryRaw   = String(props.token_iban_expiry||props.Token_iban_expiry||'');

    if(!tokenStored) return jres(401, { ok:false, error:'Token missing' });
    if(tokenStored !== String(token)) return jres(401, { ok:false, error:'Token mismatch', got:{ token }, stored:{ tokenStored } });
    if(ENFORCE_EXPIRY && expiryRaw){ const exp=safeDate(expiryRaw); if(exp && exp < new Date()) return jres(410, { ok:false, error:'Token expired' }); }

    // 2) Fetch get_contact by ID
    if (!INTERNAL_KEY) return jres(500, { ok:false, error:'Missing GET_CONTACT_INTERNAL_KEY' });
    const url = `${GET_CONTACT_BASE_URL}/.netlify/functions/get_contact?id=${encodeURIComponent(id)}&lang=${encodeURIComponent(lang)}`;
    const rc = await fetchFn(url, { headers:{ 'x-internal-key': INTERNAL_KEY } });
    const text = await rc.text();
    let cj = {};
    try { cj = JSON.parse(text); } catch { return jres(rc.status||500, { ok:false, error:'Invalid JSON from get_contact', raw:text, url }); }
    if(!rc.ok){ return jres(rc.status, { ok:false, error:`get_contact failed: ${rc.status}`, body:cj }); }

    const ro = cj.readonly || cj.data || cj || {};
    // Try to detect the ID field returned by get_contact (common keys)
    const gotId = String(ro.id || ro.ID || ro.vn_id || ro.customer_id || '').trim();
    if (gotId && String(gotId) != String(id).trim()){
      return jres(409, { ok:false, error:'ID mismatch from get_contact', requestedId:String(id), receivedId:String(gotId), readonly: ro });
    }

    return jres(200, { ok:true, email, id, readonly: ro, source:'get_contact' });
  } catch (err) {
    const dbg = (process.env.DEBUG === '1');
    return jres(500, { ok:false, error: String(err?.message||err), stack: dbg ? String(err?.stack||'') : undefined });
  }
};
