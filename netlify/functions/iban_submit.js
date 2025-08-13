// netlify/functions/iban_submit.js

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

const ENFORCE_EXPIRY = (process.env.ENFORCE_EXPIRY||'0')==='1';
const ENFORCE_SINGLE_USE = true;

function parse(event){
  const H = event.headers||{};
  const ct=(H['content-type']||H['Content-Type']||'').toLowerCase();
  if(ct.includes('application/json')){ try{return JSON.parse(event.body||'{}')}catch{return {}} }
  try{ const o={}; new URLSearchParams(event.body||'').forEach((v,k)=>o[k]=v); return o; }catch{ return {}; }
}
function firstIp(xff){ return xff?String(xff).split(',')[0].trim():'' }
function sanitizeUA(ua){ return String(ua||'').replace(/[\u0000-\u001F]+/g,'').trim().slice(0,255) }
function cleanIBAN(x){ return String(x||'').replace(/\s+/g,'').toUpperCase() }
function isValidIBAN(iban){ const s=cleanIBAN(iban); if(!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(s)) return false; const r=s.slice(4)+s.slice(0,4); const e=r.replace(/[A-Z]/g,ch=>(ch.charCodeAt(0)-55).toString()); let m=0; for(let i=0;i<e.length;i++){ const c=e.charCodeAt(i)-48; if(c<0||c>35) return false; m=(m*10+c)%97; } return m===1; }

async function mjGetContactIdByEmail(email){ const r=await fetchFn(`https://api.mailjet.com/v3/REST/contact/?ContactEmail=${encodeURIComponent(email)}`,{ headers:{ Authorization: mjAuth } }); if(!r.ok){ const t=await r.text(); throw new Error(`Mailjet contact fetch failed: ${r.status} ${t}`); } const j=await r.json(); const id=j?.Data?.[0]?.ID; if(!id) throw new Error(`Mailjet contact not found for ${email}`); return id; }

exports.handler = async (event)=>{
  try{
    if(event.httpMethod!=='POST') return { statusCode:405, body:'Method Not Allowed' };
    const H=event.headers||{}; const b=parse(event);
    let { id, token, em, email, lang, iban, iban_confirm } = b;
    if(!email && em) email = b64urlDecode(em) || em;
    if(!email || !token) return jres(400, { ok:false, error:'Missing token/email' });

    const a=cleanIBAN(iban), b2=cleanIBAN(iban_confirm);
    if(!a||!b2) return jres(400, { ok:false, error:'Missing IBAN fields' });
    if(a!==b2) return jres(422, { ok:false, error:'IBAN mismatch' });
    if(!isValidIBAN(a)) return jres(422, { ok:false, error:'IBAN invalid' });

    const ua = sanitizeUA(H['user-agent']||H['User-Agent']||'');
    const ip = firstIp(H['x-forwarded-for']||H['X-Forwarded-For']) || H['x-nf-client-connection-ip'] || H['client-ip'] || H['x-real-ip'] || 'unknown';
    const nowISO = iso(new Date());

    const contactId = await mjGetContactIdByEmail(email);
    const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, { headers:{ Authorization: mjAuth } });
    if(!r.ok){ const t=await r.text(); return jres(502, { ok:false, error:`Mailjet fetch failed: ${t}` }) }
    const propsArr=(await r.json())?.Data?.[0]?.Data||[]; const props=Object.fromEntries(propsArr.map(p=>[p.Name,p.Value]));

    const tokenStored = String(props.token_iban||'');
    const expiryRaw   = String(props.token_iban_expiry||props.Token_iban_expiry||'');
    if(!tokenStored) return jres(401, { ok:false, error:'Token missing' });
    if(ENFORCE_SINGLE_USE && String(props.token_iban_used_at||'').trim()!=='') return jres(409, { ok:false, error:'Token already used' });
    if(tokenStored !== String(token)) return jres(401, { ok:false, error:'Token mismatch' });
    if(ENFORCE_EXPIRY && expiryRaw){ const exp=new Date(expiryRaw); if(isFinite(exp)&&exp<new Date()) return jres(410, { ok:false, error:'Token expired' }); }

    const Data = [
      { Name:'iban', Value: a },
      { Name:'ip_iban', Value: ip },
      { Name:'timestamp_iban', Value: nowISO },
      { Name:'agent_iban', Value: ua },
      { Name:'token_iban_used_at', Value: nowISO },
      { Name:'token_iban', Value: '' },
      { Name:'token_iban_expiry', Value: '' }
    ];
    const u = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, { method:'PUT', headers:{ Authorization: mjAuth, 'Content-Type':'application/json' }, body: JSON.stringify({ Data }) });
    if(!u.ok){ const t=await u.text(); return jres(502, { ok:false, error:`Mailjet update failed: ${t}` }) }

    return jres(200, { ok:true, redirect:'/danke.html' });
  }catch(err){
    const dbg = process.env.DEBUG==='1';
    return jres(500, { ok:false, error:String(err&&err.message||err), stack: dbg?String(err&&err.stack||''):undefined });
  }
};
