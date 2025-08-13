
const { mjGetContactByEmail, mjUpdateContactProps } = require('./_lib');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const qs = event.queryStringParameters || {};
    const id = qs.id || '';
    const token = String(qs.token||'').trim();
    const lang = (qs.lang||'de').toLowerCase();
    const email = Buffer.from(String(qs.em||''), 'base64url').toString('utf8');

    if (!id || !token || !email) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Missing id/token/email' }) };

    const contact = await mjGetContactByEmail(email);
    const p = contact.props || {};

    if (p.token_iban !== token) return { statusCode: 403, body: JSON.stringify({ ok:false, error:'Invalid token' }) };
    const expiry = new Date(p.token_iban_expiry || 0).getTime();
    const now = Date.now();
    const testMode = String(process.env.IBAN_TEST_MODE||'0') === '1';
    if (now > expiry && !testMode) return { statusCode: 410, body: JSON.stringify({ ok:false, error:'Token expired' }) };

    const ids = [p.glaeubiger_nr, p.glaeubiger, p.creditor_id, p.id].filter(Boolean).map(String);
    if (ids.length && !ids.includes(String(id))) {
      return { statusCode: 403, body: JSON.stringify({ ok:false, error:'ID mismatch' }) };
    }

    if (p.iban_status !== 'submitted') {
      try { await mjUpdateContactProps(contact.id, { iban_status: 'opened' }); } catch {}
    }

    const display = {
      creditor_id: p.glaeubiger_nr || p.glaeubiger || '',
      first_name: p.vorname || '',
      last_name: p.nachname || '',
      street: p.strasse || p.adresse_strasse || '',
      house_no: p.hausnummer || p.adresse_hausnummer || '',
      zip: p.plz || p.adresse_plz || '',
      city: p.ort || p.adresse_ort || '',
      country: p.land || p.adresse_land || '',
      category: p.category || 'VN DIREKT',
      language: p.sprache || lang
    };

    return { statusCode: 200, body: JSON.stringify({ ok:true, display }) };
  } catch (e) {
    return { statusCode: 500, body: `error:${e.message}` };
  }
};
