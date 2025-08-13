// netlify/functions/send_iban_email.js
const crypto = require('crypto');

let fetchImpl = (typeof fetch !== 'undefined') ? fetch : null;
if (!fetchImpl) { fetchImpl = require('node-fetch'); }
const fetchFn = (...args) => fetchImpl(...args);


function jres(code, obj){ return { statusCode: code, headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj) }; }
function b64url(input){ return Buffer.from(input,'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64urlDecode(s){ if(!s) return ''; s=String(s).replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; try{return Buffer.from(s,'base64').toString('utf8')}catch{return ''} }
function iso(d){ return new Date(d).toISOString(); }
function addDays(d,n){ const t=new Date(d); t.setUTCDate(t.getUTCDate()+n); return t; }


const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

const BASE_PUBLIC_URL = process.env.BASE_PUBLIC_URL || 'https://iban.sikuralife.com';
const IBAN_TOKEN_DAYS = parseInt(process.env.IBAN_TOKEN_DAYS || '7', 10);

const TPL = {
  de: { direct: Number(process.env.TEMPLATE_DE_IBAN_DIRECT||0), lawyer: Number(process.env.TEMPLATE_DE_IBAN_LAWYER||0) },
  en: { direct: Number(process.env.TEMPLATE_EN_IBAN_DIRECT||0), lawyer: Number(process.env.TEMPLATE_EN_IBAN_LAWYER||0) },
  it: { direct: Number(process.env.TEMPLATE_IT_IBAN_DIRECT||0)||Number(process.env.TEMPLATE_EN_IBAN_DIRECT||0),
        lawyer: Number(process.env.TEMPLATE_IT_IBAN_LAWYER||0)||Number(process.env.TEMPLATE_EN_IBAN_LAWYER||0) }
};

function pickLang(x){ const s=String(x||'de').toLowerCase(); return (s==='en'||s==='it')?s:'de'; }
function pickTemplate(lang, category){ const k = (String(category||'').toLowerCase().includes('lawyer')) ? 'lawyer':'direct'; const g = TPL[pickLang(lang)]; return (g && g[k]) || 0; }

function parseBody(event){
  const ct=(event.headers['content-type']||event.headers['Content-Type']||'').toLowerCase();
  if(ct.includes('application/json')){ try{return JSON.parse(event.body||'{}')}catch{return {}} }
  try{ const o={}; new URLSearchParams(event.body||'').forEach((v,k)=>o[k]=v); return o; }catch{ return {}; }
}

async function mjGetContactIdByEmail(email){
  const r = await fetchFn(`https://api.mailjet.com/v3/REST/contact/?ContactEmail=${encodeURIComponent(email)}`, { headers: { Authorization: mjAuth } });
  if(!r.ok){ const t=await r.text(); throw new Error(`Mailjet contact fetch failed: ${r.status} ${t}`); }
  const j = await r.json(); const id = j?.Data?.[0]?.ID; if(!id) throw new Error(`Mailjet contact not found for ${email}`); return id;
}

async function mjGetContactDataById(contactId){
  const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, { headers: { Authorization: mjAuth } });
  if(!r.ok){ const t=await r.text(); throw new Error(`Mailjet contactdata fetch failed: ${r.status} ${t}`); }
  const j = await r.json(); return j?.Data?.[0]?.Data || [];
}

async function mjUpdateContactDataById(contactId, kv){
  const Data = Object.entries(kv).map(([Name,Value])=>({Name,Value:String(Value??'')}));
  const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, {
    method:'PUT', headers:{ Authorization:mjAuth, 'Content-Type':'application/json' }, body: JSON.stringify({ Data }) });
  if(!r.ok){ const t=await r.text(); throw new Error(`Mailjet contactdata update failed: ${r.status} ${t}`); }
}

async function mjSendTemplateMail(toEmail, templateId, variables){
  if(!templateId||Number(templateId)===0) return;
  const r = await fetchFn('https://api.mailjet.com/v3.1/send', {
    method:'POST', headers:{ Authorization:mjAuth, 'Content-Type':'application/json' },
    body: JSON.stringify({
      Messages:[{ From: { Email: process.env.MAIL_FROM_ADDRESS||process.env.MJ_FROM_EMAIL, Name: process.env.MAIL_FROM_NAME||process.env.MJ_FROM_NAME||'Sikura' },
                   To:[{ Email: toEmail }], TemplateID:Number(templateId), TemplateLanguage:true, Variables:variables||{} }]
    }) });
  if(!r.ok){ const t=await r.text(); throw new Error(`Mailjet send failed: ${r.status} ${t}`); }
}

exports.handler = async (event)=>{
  try{ 
    if(event.httpMethod!=='POST') return { statusCode:405, body:'Method Not Allowed' };
    const b=parseBody(event);
    const email=String(b.email||'').trim(); const id=String(b.id||'').trim(); const lang=pickLang(b.lang); const category=String(b.category||'').trim();
    if(!email||!id) return { statusCode:400, body:'Missing email or id' };

    const contactId = await mjGetContactIdByEmail(email);
    const props = Object.fromEntries((await mjGetContactDataById(contactId)).map(p=>[p.Name,p.Value]));

    // Idempotent: reuse existing valid token
    let token = String(props.token_iban||'').trim();
    let expiry = String(props.token_iban_expiry||'').trim();
    const usedAt = String(props.token_iban_used_at||'').trim();
    const now = new Date();
    let reused = false;
    if(token && !usedAt){
      const exp = expiry ? new Date(expiry) : null;
      if(!exp || exp>now) reused = true; // still valid
    }
    if(!reused){
      token = crypto.randomUUID().replace(/-/g,'') + Date.now().toString(36);
      expiry = iso(addDays(now, IBAN_TOKEN_DAYS));
      await mjUpdateContactDataById(contactId, { token_iban: token, token_iban_expiry: expiry, token_iban_used_at: '' });
    }

    const em = b64url(email);
    const url = `${BASE_PUBLIC_URL}/?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&em=${encodeURIComponent(em)}&lang=${encodeURIComponent(lang)}`;
    const templateId = pickTemplate(lang, category);
    await mjSendTemplateMail(email, templateId, { url, id, lang, category });

    return jres(200, { ok:true, url, expiresAt: expiry, templateId, reused });
  }catch(err){ 
    const dbg = process.env.DEBUG==='1';
    return jres(500, { ok:false, error: String(err&&err.message||err), stack: dbg?String(err&&err.stack||''):undefined });
  }
};
