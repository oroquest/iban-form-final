
const { mjGetContactByEmail, mjUpdateContactProps, clientIp, userAgent, sanitizeIban, ibanIsValid } = require('./_lib');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const isJson = (event.headers['content-type']||'').includes('application/json');
    const body = isJson ? JSON.parse(event.body||'{}') : Object.fromEntries(new URLSearchParams(event.body||''));

    const email = Buffer.from(String(body.em||''), 'base64url').toString('utf8');
    const id = body.id || '';
    const token = String(body.token||'').trim();
    const lang = (body.lang||'de').toLowerCase();
    const iban = sanitizeIban(body.iban||'');
    const glaeubiger = body.glaeubiger || '';
    const bic = String(body.bic||'').toUpperCase().trim();
    const country = body.country || '';

    if (!email || !id || !token || !iban) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Missing fields' }) };
    if (!ibanIsValid(iban)) return { statusCode: 422, body: JSON.stringify({ ok:false, error:'Invalid IBAN' }) };
    if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) return { statusCode: 422, body: JSON.stringify({ ok:false, error:'Invalid BIC' }) };

    const contact = await mjGetContactByEmail(email);
    const p = contact.props || {};

    if (p.token_iban !== token) return { statusCode: 403, body: JSON.stringify({ ok:false, error:'Invalid token' }) };
    const expiry = new Date(p.token_iban_expiry || 0).getTime();
    const now = Date.now();
    const testMode = String(process.env.IBAN_TEST_MODE||'0') === '1';
    if (now > expiry && !testMode) return { statusCode: 410, body: JSON.stringify({ ok:false, error:'Token expired' }) };
    if (p.token_iban_used_at) return { statusCode: 409, body: JSON.stringify({ ok:false, error:'Token already used' }) };

    const ids = [p.glaeubiger_nr, p.glaeubiger, p.creditor_id, p.id].filter(Boolean).map(String);
    if (ids.length && !ids.includes(String(id))) {
      return { statusCode: 403, body: JSON.stringify({ ok:false, error:'ID mismatch' }) };
    }

    const ts = new Date().toISOString();
    const update = {
      iban,
      glaeubiger,
      bic,
      country,
      ip_iban: clientIp(event),
      agent_iban: userAgent(event),
      timestamp_iban: ts,
      token_iban: '',
      token_iban_expiry: '',
      token_iban_used_at: ts,
      iban_status: 'submitted'
    };
    await mjUpdateContactProps(contact.id, update);

    return { statusCode: 302, headers: { Location: '/danke.html' }, body: '' };
  } catch (e) {
    return { statusCode: 500, body: `error:${e.message}` };
  }
};
