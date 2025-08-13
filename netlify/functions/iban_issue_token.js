// netlify/functions/iban_issue_token.js
// Uses native fetch (Node 18+/20). No node-fetch import needed.

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const isJson = (event.headers['content-type']||'').includes('application/json');
    const body = isJson ? JSON.parse(event.body||'{}') : Object.fromEntries(new URLSearchParams(event.body||''));

    const email    = String(body.email||'').trim();
    const id       = String(body.id||'').trim();
    const lang     = String(body.lang||'de').toLowerCase();
    const category = String(body.category || process.env.IBAN_DEFAULT_CATEGORY || 'VN DIREKT').trim();
    const send     = String(body.send||'0').toLowerCase() in { '1':1, 'true':1, 'yes':1 };

    if (!email || !id) return { statusCode: 400, body: 'Missing email or id' };

    const mjAuth = 'Basic ' + Buffer.from(`${process.env.MJ_APIKEY_PUBLIC}:${process.env.MJ_APIKEY_PRIVATE}`).toString('base64');
    const mjBase = 'https://api.mailjet.com';

    // Contact by email
    const cRes = await fetch(`${mjBase}/v3/REST/contact?Email=${encodeURIComponent(email)}`, { headers: { Authorization: mjAuth } });
    const cJson = await cRes.json();
    if (!cRes.ok || !cJson?.Data?.length) {
      return { statusCode: 404, body: JSON.stringify({ ok:false, error:'contact_not_found', email }) };
    }
    const contactId = cJson.Data[0].ID;

    // Token
    const token = require('crypto').randomBytes(16).toString('hex');
    const days  = Number(process.env.IBAN_TOKEN_DAYS||'7');
    const expiresAt = new Date(Date.now() + days*24*60*60*1000).toISOString();
    const baseUrl = process.env.BASE_IBAN_URL || 'https://iban.sikuralife.com';
    const em = Buffer.from(email).toString('base64url');
    const url = `${baseUrl}/?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&em=${encodeURIComponent(em)}&lang=${encodeURIComponent(lang)}`;

    // Update IBAN fields only
    const Data = [
      { Name:'token_iban',         Value: token      },
      { Name:'token_iban_expiry',  Value: expiresAt  },
      { Name:'token_iban_used_at', Value: ''         },
      { Name:'link_iban',          Value: url        },
      { Name:'sprache',            Value: lang       },
      { Name:'iban_status',        Value: 'issued'   }
    ];
    const uRes = await fetch(`${mjBase}/v3/REST/contactdata/${contactId}`, {
      method: 'PUT',
      headers: { Authorization: mjAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ Data })
    });
    if (!uRes.ok) {
      return { statusCode: uRes.status, body: `mailjet_update_failed:${await uRes.text()}` };
    }

    // Optional send via template
    if (send) {
      const langNorm = (lang === 'it') ? 'en' : lang;
      const cat = category.toUpperCase();
      const map = {
        'de__VN DIREKT': process.env.TEMPLATE_DE_IBAN_DIRECT,
        'de__VN ANWALT': process.env.TEMPLATE_DE_IBAN_LAWYER,
        'en__VN DIREKT': process.env.TEMPLATE_EN_IBAN_DIRECT,
        'en__VN ANWALT': process.env.TEMPLATE_EN_IBAN_LAWYER
      };
      const TemplateID = Number(map[`${langNorm}__${cat}`] || 0);
      if (!TemplateID) return { statusCode: 400, body: 'template_missing' };
      const payload = {
        Messages: [{
          From: { Email: process.env.MAIL_FROM_ADDRESS, Name: process.env.MAIL_FROM_NAME },
          To: [{ Email: email }],
          TemplateID, TemplateLanguage: true,
          Subject: 'IBAN-Erhebung',
          Variables: { link: url, id, lang: langNorm, category: cat }
        }]
      };
      const sRes = await fetch(`${mjBase}/v3.1/send`, {
        method: 'POST', headers: { Authorization: mjAuth, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const sJson = await sRes.json().catch(()=> ({}));
      if (!sRes.ok || sJson?.Messages?.[0]?.Status !== 'success') {
        return { statusCode: sRes.status, body: `send_failed:${JSON.stringify(sJson)}` };
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true, url, token, expiresAt }) };
  } catch (e) {
    return { statusCode: 500, body: `error:${e.message}` };
  }
};
