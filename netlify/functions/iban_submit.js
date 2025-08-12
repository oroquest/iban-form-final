// netlify/functions/iban_submit.js

let fetchImpl = (typeof fetch !== 'undefined') ? fetch : null;
if (!fetchImpl) { fetchImpl = require('node-fetch'); }
const fetchFn = (...args) => fetchImpl(...args);

const MJ_PUBLIC  = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const mjAuth = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');
const ENFORCE_EXPIRY     = true;
const ENFORCE_SINGLE_USE = true;

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

function parseBody(event) { const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase(); if (ct.includes('application/json')) { try { return JSON.parse(event.body||'{}'); } catch { return {}; } } try { const params = new URLSearchParams(event.body||''); const o={}; params.forEach((v,k)=>o[k]=v); return o; } catch { return {}; } }
function b64urlDecode(s){ if(!s) return ''; s=String(s).replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; try {return Buffer.from(s,'base64').toString('utf8')}catch{return ''} }
function firstIp(xff){ return xff ? String(xff).split(',')[0].trim() : '' }
function sanitizeUA(ua){ return String(ua||'').replace(/[\u0000-\u001F]+/g,'').trim().slice(0,255) }
function isValidIBAN(input){ const s = String(input||'').replace(/\s+/g,'').toUpperCase(); if(!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(s)) return false; const rearr = s.slice(4)+s.slice(0,4); const expanded = rearr.replace(/[A-Z]/g,ch=>(ch.charCodeAt(0)-55).toString()); let rem=0; for(let i=0;i<expanded.length;i++){ const code = expanded.charCodeAt(i)-48; if(code<0||code>35) return false; rem=(rem*10+code)%97; } return rem===1; }
exports.handler = async (event) => {
  try{
    if(event.httpMethod!=='POST') return { statusCode:405, body:'Method Not Allowed' };
    const H = event.headers||{};
    const body = parseBody(event);
    let { id, token, em, email, lang, iban, iban_confirm } = body;
    if(!email && em) email = b64urlDecode(em).trim();
    if(!email || !token) return { statusCode:400, body:'Missing token/email' };
    if(!iban || !iban_confirm) return { statusCode:400, body:'Missing IBAN fields' };
    const cleanIBAN = String(iban).replace(/\s+/g,''); const cleanIBAN2 = String(iban_confirm).replace(/\s+/g,'');
    if(cleanIBAN !== cleanIBAN2) return { statusCode:422, body:'IBAN mismatch' };
    if(!isValidIBAN(cleanIBAN)) return { statusCode:422, body:'IBAN invalid' };
    const userAgent = sanitizeUA(H['user-agent']||H['User-Agent']||''); const ip = firstIp(H['x-forwarded-for']||H['X-Forwarded-For']) || H['x-nf-client-connection-ip'] || H['client-ip'] || H['x-real-ip'] || 'unknown'; const nowISO = new Date().toISOString();
    const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(email)}`, { headers: { Authorization: mjAuth } }); if(!r.ok){ return debugResponse(502, new Error('Mailjet fetch failed')); }
    const j = await r.json(); const propsArr = (j && j.Data && j.Data[0] && j.Data[0].Data) ? j.Data[0].Data : []; const props = Object.fromEntries(propsArr.map(p=>[p.Name,p.Value]));
    const tokenStored = String(props.token_iban||''); const expiryRaw   = String(props.token_iban_expiry||props.Token_iban_expiry||'');
    if(!tokenStored) return { statusCode:401, body:'Token missing' };
    if(ENFORCE_SINGLE_USE && String(props.token_iban_used_at||'').trim()!=='') { return { statusCode:409, body:'Token already used' }; }
    if(tokenStored !== String(token)) return { statusCode:401, body:'Token mismatch' };
    if(ENFORCE_EXPIRY && expiryRaw){ const exp = new Date(expiryRaw); if(isFinite(exp) && exp < new Date()) return { statusCode:410, body:'Token expired' }; }
    const Data = [ { Name:'iban', Value: cleanIBAN }, { Name:'ip_iban', Value: ip }, { Name:'timestamp_iban', Value: nowISO }, { Name:'agent_iban', Value: userAgent }, { Name:'token_iban_used_at', Value: nowISO }, { Name:'token_iban', Value: '' }, { Name:'token_iban_expiry', Value: '' } ];
    const u = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(email)}`, { method:'PUT', headers:{ Authorization: mjAuth, 'Content-Type':'application/json' }, body: JSON.stringify({ Data }) });
    if(!u.ok){ const t = await u.text(); return debugResponse(502, new Error(`Mailjet update failed: ${u.status} ${t}`)); }
    const accept = (H['accept']||H['Accept']||'').toLowerCase(); const wantsJSON = accept.includes('application/json') || (H['x-requested-with']||'').toLowerCase()==='fetch'; const danke = '/danke.html';
    if(wantsJSON){ return { statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:true, redirect:danke }) }; }
    return { statusCode:302, headers:{ Location: danke }, body:'' };
  }catch(err){ return debugResponse(500, err); }
};
