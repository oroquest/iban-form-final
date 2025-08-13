
const MJ_BASE = 'https://api.mailjet.com';
const mjAuthHeader = () => {
  const pub = process.env.MJ_APIKEY_PUBLIC;
  const priv = process.env.MJ_APIKEY_PRIVATE;
  const token = Buffer.from(`${pub}:${priv}`).toString('base64');
  return { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' };
};

async function mjGetContactByEmail(email) {
  const r = await fetch(`${MJ_BASE}/v3/REST/contact?Email=${encodeURIComponent(email)}`, {
    headers: mjAuthHeader()
  });
  const j = await r.json();
  if (!j || !j.Data || !j.Data.length) throw new Error('contact_not_found');
  const contact = j.Data[0];
  const r2 = await fetch(`${MJ_BASE}/v3/REST/contactdata/${contact.ID}`, { headers: mjAuthHeader() });
  const j2 = await r2.json();
  const props = {};
  if (j2 && j2.Data && j2.Data[0] && Array.isArray(j2.Data[0].Data)) {
    for (const kv of j2.Data[0].Data) props[kv.Name] = kv.Value;
  }
  return { id: contact.ID, email: contact.Email, props };
}

async function mjUpdateContactProps(contactId, obj) {
  const Data = Object.keys(obj).map(Name => ({ Name, Value: obj[Name] }));
  const r = await fetch(`${MJ_BASE}/v3/REST/contactdata/${contactId}`, {
    method: 'PUT',
    headers: mjAuthHeader(),
    body: JSON.stringify({ Data })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`mj_update_failed:${r.status}:${t}`);
  }
  return true;
}

function buildIbanLink({ baseUrl, id, token, email, lang }) {
  const qs = new URLSearchParams({
    id: String(id || ''),
    token: String(token || ''),
    em: Buffer.from(String(email)).toString('base64url'),
    lang: String((lang || 'de')).toLowerCase()
  });
  return `${baseUrl}/?${qs.toString()}`;
}

function pickTemplate({ language, category }) {
  const catNorm = String(category || '').trim().toUpperCase();
  const lang = String(language || 'de').toLowerCase();
  const finalLang = (lang === 'it') ? 'en' : lang;
  const map = {
    'de__VN DIREKT': process.env.TEMPLATE_DE_IBAN_DIRECT,
    'de__VN ANWALT': process.env.TEMPLATE_DE_IBAN_LAWYER,
    'en__VN DIREKT': process.env.TEMPLATE_EN_IBAN_DIRECT,
    'en__VN ANWALT': process.env.TEMPLATE_EN_IBAN_LAWYER
  };
  return map[`${finalLang}__${catNorm}`];
}

async function mjSendEmail({ to, subject, templateId, variables }) {
  const payload = {
    Messages: [{
      From: { Email: process.env.MAIL_FROM_ADDRESS, Name: process.env.MAIL_FROM_NAME },
      To: [{ Email: to }],
      TemplateID: Number(templateId),
      TemplateLanguage: true,
      Variables: variables || {},
      Subject: subject || "IBAN-Erhebung"
    }]
  };
  const r = await fetch(`${MJ_BASE}/v3.1/send`, {
    method: 'POST',
    headers: mjAuthHeader(),
    body: JSON.stringify(payload)
  });
  const j = await r.json();
  if (!r.ok || j.Messages?.[0]?.Status !== 'success') {
    throw new Error(`send_failed:${r.status}:${JSON.stringify(j)}`);
  }
  return j;
}

function nowIso() { return new Date().toISOString(); }
function addDaysIso(days) { return new Date(Date.now() + days*24*60*60*1000).toISOString(); }

function clientIp(event) {
  return (event.headers['x-forwarded-for'] || event.headers['client-ip'] || event.ip || '').split(',')[0].trim();
}
function userAgent(event) {
  return event.headers['user-agent'] || '';
}

function sanitizeIban(s) {
  return String(s||'').toUpperCase().replace(/\s+/g,'');
}

function ibanIsValid(iban) {
  const s = sanitizeIban(iban);
  if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const rearr = s.slice(4)+s.slice(0,4);
  const toNum = (ch)=>{
    const c=ch.charCodeAt(0);
    if(c>=48&&c<=57) return ch;
    if(c>=65&&c<=90) return String(c-55);
    return '';
  };
  let rem = 0;
  let buf = '';
  for (const ch of rearr) {
    buf += toNum(ch);
    while (buf.length >= 7) {
      rem = Number(String(rem)+buf.slice(0,7)) % 97;
      buf = buf.slice(7);
    }
  }
  if (buf.length) rem = Number(String(rem)+buf) % 97;
  return rem === 1;
}

module.exports = {
  mjGetContactByEmail,
  mjUpdateContactProps,
  mjSendEmail,
  buildIbanLink,
  pickTemplate,
  nowIso,
  addDaysIso,
  clientIp,
  userAgent,
  sanitizeIban,
  ibanIsValid
};
