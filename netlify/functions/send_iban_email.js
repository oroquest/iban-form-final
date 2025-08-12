// netlify/functions/send_iban_email.js
// Idempotent token issuing: reuse existing un-used, un-expired token_iban if present.
// Otherwise generate a new one and store it.
// Build URL to ROOT "/", like verify.

const crypto = require('crypto');

let fetchImpl = (typeof fetch !== 'undefined') ? fetch : null;
if (!fetchImpl) { fetchImpl = require('node-fetch'); }
const fetchFn = (...args) => fetchImpl(...args);

const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

const BASE_URL = process.env.BASE_PUBLIC_URL || 'https://iban.sikuralife.com';
const EXPIRY_DAYS = parseInt(process.env.IBAN_TOKEN_DAYS || '7', 10);
const REUSE_VALID_TOKEN = (process.env.REUSE_VALID_TOKEN || '1') === '1';

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
function pickLang(x) { const s=String(x||'de').toLowerCase(); return s==='en'?'en':'de'; }
function pickTemplate(lang, category) {
  const l = pickLang(lang);
  const c = String(category||'direct').toLowerCase();
  const group = TPL[l] || TPL.de;
  const key = c.includes('lawyer') ? 'lawyer' : 'direct';
  return group[key] || group.direct || 0;
}
function parseBody(event){
  const ct=(event.headers['content-type']||event.headers['Content-Type']||'').toLowerCase();
  if(ct.includes('application/json')){ try{ return JSON.parse(event.body||'{}'); }catch{return {};} }
  try{ const o={}; new URLSearchParams(event.body||'').forEach((v,k)=>o[k]=v); return o; }catch{return {};}
}
function addDays(d,n){ const t=new Date(d); t.setUTCDate(t.getUTCDate()+n); return t; }
function iso(d){ return new Date(d).toISOString(); }
function safeDate(x){ const d=new Date(x); return isFinite(d)?d:null; }

async function mjGetContactIdByEmail(email) {
  const r = await fetchFn(`https://api.mailjet.com/v3/REST/contact/?ContactEmail=${encodeURIComponent(email)}`, {
    headers: { Authorization: mjAuth }
  });
  if(!r.ok){ const t=await r.text(); throw new Error(`Mailjet contact fetch failed: ${r.status} ${t}`); }
  const j = await r.json();
  const id = j?.Data?.[0]?.ID;
  if(!id) throw new Error(`Mailjet contact not found for ${email}`);
  return id;
}
async function mjGetContactDataById(contactId){
  const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, {
    headers: { Authorization: mjAuth }
  });
  if(!r.ok){ const t=await r.text(); throw new Error(`Mailjet contactdata fetch failed: ${r.status} ${t}`); }
  const j = await r.json();
  const arr = j?.Data?.[0]?.Data || [];
  return Object.fromEntries(arr.map(p=>[p.Name, p.Value]));
}
async function mjUpdateContactDataById(contactId, kv) {
  const Data = Object.entries(kv).map(([Name, Value]) => ({ Name, Value: String(Value ?? '') }));
  const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, {
    method: 'PUT',
    headers: { Authorization: mjAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Data })
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`Mailjet contactdata update failed: ${r.status} ${t}`); }
}
async function mjSendTemplateMail({ toEmail, templateId, variables }) {
  if (!templateId || Number(templateId) === 0) return;
  const r = await fetchFn('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: { Authorization: mjAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Messages: [{
        From: { Email: process.env.MAIL_FROM_ADDRESS || process.env.MJ_FROM_EMAIL, Name: process.env.MAIL_FROM_NAME || process.env.MJ_FROM_NAME || 'Sikura' },
        To: [{ Email: toEmail }],
        TemplateID: Number(templateId),
        TemplateLanguage: true,
        Variables: variables || {}
      }]
    })
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`Mailjet send failed: ${r.status} ${t}`); }
}

function jres(code, obj){ return { statusCode: code, headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj) }; }
function dbg(code, err){
  if(process.env.DEBUG==='1'){
    return jres(code, { ok:false, error:String(err && err.message || err), stack:String(err && err.stack || '') });
  }
  return { statusCode: code, body: 'Server error' };
}

exports.handler = async (event) => {
  try{
    if(event.httpMethod!=='POST') return { statusCode:405, body:'Method Not Allowed' };
    const body = parseBody(event);
    const email = String(body.email||'').trim();
    const id    = String(body.id||'').trim();
    const lang  = pickLang(body.lang);
    const category = String(body.category||'').trim();
    if(!email || !id) return { statusCode:400, body:'Missing email or id' };

    const contactId = await mjGetContactIdByEmail(email);
    let props = await mjGetContactDataById(contactId);

    let token = String(props.token_iban||'').trim();
    let expiresISO = String(props.token_iban_expiry||props.Token_iban_expiry||'').trim();
    const usedAt = String(props.token_iban_used_at||'').trim();
    let reuse = false;

    // Reuse existing, un-used, un-expired token if allowed
    if(REUSE_VALID_TOKEN && token && !usedAt){
      const exp = safeDate(expiresISO);
      if(!exp || exp > new Date()){
        reuse = true;
      }
    }
    if(!reuse){
      token = crypto.randomUUID().replace(/-/g,'') + Date.now().toString(36);
      expiresISO = iso(addDays(new Date(), EXPIRY_DAYS));
      await mjUpdateContactDataById(contactId, {
        token_iban: token,
        token_iban_expiry: expiresISO,
        token_iban_used_at: ''
      });
    }

    const em = b64url(email);
    const url = `${BASE_URL}/?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&em=${encodeURIComponent(em)}&lang=${encodeURIComponent(lang)}`;

    const templateId = pickTemplate(lang, category);
    await mjSendTemplateMail({
      toEmail: email,
      templateId,
      variables: { url, id, lang, category }
    });

    return jres(200, { ok:true, templateId: templateId||0, expiresAt: expiresISO, url, reused: reuse });
  }catch(err){
    return dbg(500, err);
  }
};