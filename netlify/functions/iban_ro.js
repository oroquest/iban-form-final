// netlify/functions/iban_ro.js  (v3: accepts GET or POST; reads query AND body)
let fetchImpl = (typeof fetch !== 'undefined') ? fetch : null;
if (!fetchImpl) { fetchImpl = require('node-fetch'); }
const fetchFn = (...args) => fetchImpl(...args);

const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

const ENFORCE_EXPIRY = true;
const BASE_URL = process.env.BASE_PUBLIC_URL || 'https://iban.sikuralife.com';
const INTERNAL_KEY = process.env.GET_CONTACT_INTERNAL_KEY || '';

function parseBody(event){
  const ct=(event.headers['content-type']||event.headers['Content-Type']||'').toLowerCase();
  if(ct.includes('application/json')){ try{return JSON.parse(event.body||'{}')}catch{return {}} }
  try{ const o={}; new URLSearchParams(event.body||'').forEach((v,k)=>o[k]=v); return o; }catch{return {}}
}
function b64urlDecode(s){ if(!s) return ''; s=String(s).replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; try {return Buffer.from(s,'base64').toString('utf8')}catch{return ''} }
function normalizePairs(arr){ return Object.fromEntries((arr||[]).map(p=>[p.Name, p.Value])); }
const jres = (code, obj) => ({ statusCode: code, headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj) });

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
    const b = (event.httpMethod === 'POST') ? parseBody(event) : {};
    // accept from query OR body (body wins if present)
    let id     = (b.id     ?? q.id     ?? '').toString();
    let token  = (b.token  ?? q.token  ?? '').toString();
    let em     = (b.em     ?? q.em     ?? '').toString();
    let email  = (b.email  ?? q.email  ?? '').toString();
    let lang   = (b.lang   ?? q.lang   ?? 'de').toString();

    if(!email && em) email = b64urlDecode(em).trim();
    if(!email || !token){
      const debug = process.env.DEBUG === '1';
      return debug
        ? jres(400, { ok:false, error:'Missing token/email', got:{ query:q, body:b } })
        : jres(400, { ok:false, error:'Missing token/email' });
    }

    // 1) Mailjet: fetch contact props & validate token
    const contactId = await mjGetContactIdByEmail(email);
    const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, {
      headers:{ Authorization: mjAuth }
    });
    if(!r.ok){ const t = await r.text(); return jres(502, { ok:false, error:`Mailjet fetch failed: ${t}` }); }

    const j = await r.json();
    const props = normalizePairs(j?.Data?.[0]?.Data);
    const tokenStored = String(props.token_iban||'');
    const expiryRaw   = String(props.token_iban_expiry||props.Token_iban_expiry||'');

    if(!tokenStored) return jres(401, { ok:false, error:'Token missing' });
    if(tokenStored !== String(token)) return jres(401, { ok:false, error:'Token mismatch' });
    if(ENFORCE_EXPIRY && expiryRaw){
      const exp = new Date(expiryRaw);
      if(isFinite(exp) && exp < new Date()) return jres(410, { ok:false, error:'Token expired' });
    }

    // 2) Try internal get_contact (GET first, then POST) with x-internal-key
    let readonly = null;
    let raw = null;
    if (INTERNAL_KEY) {
      try {
        const url = `${BASE_URL}/.netlify/functions/get_contact?email=${encodeURIComponent(email)}&id=${encodeURIComponent(id||'')}`;
        const g = await fetchFn(url, { headers: { 'x-internal-key': INTERNAL_KEY, 'accept':'application/json' } });
        if (g.ok) {
          raw = await g.json().catch(()=>null);
        } else {
          const p = await fetchFn(`${BASE_URL}/.netlify/functions/get_contact`, {
            method:'POST',
            headers: { 'x-internal-key': INTERNAL_KEY, 'content-type': 'application/json', 'accept':'application/json' },
            body: JSON.stringify({ email, id })
          });
          if (p.ok) raw = await p.json().catch(()=>null);
        }
      } catch (e) { /* ignore */ }
    }

    if (raw && typeof raw === 'object') {
      if (raw.readonly && typeof raw.readonly === 'object') readonly = raw.readonly;
      else if (raw.data && typeof raw.data === 'object') readonly = raw.data;
      else readonly = raw;
    }

    if (!readonly) {
      readonly = {};
      for (const [k,v] of Object.entries(props)) {
        const low = k.toLowerCase();
        if (low.includes('token')) continue;
        if (low.includes('iban')) continue;
        if (low.startsWith('ip_') || low.startsWith('agent_')) continue;
        if (v == null || typeof v === 'object') continue;
        readonly[k] = String(v);
      }
    }

    return jres(200, { ok:true, email, id, readonly, props_all: props });

  } catch (err) {
    const debug = process.env.DEBUG === '1';
    return debug
      ? jres(500, { ok:false, error:String(err?.message||err) })
      : { statusCode: 500, body: 'Server error' };
  }
};