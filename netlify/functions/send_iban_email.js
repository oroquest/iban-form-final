const { mjGetContactByEmail, mjSendEmail, pickTemplate } = require('./_lib');
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const body = event.headers['content-type']?.includes('application/json') ? JSON.parse(event.body||'{}') : Object.fromEntries(new URLSearchParams(event.body||''));
    const email = String(body.email||'').trim();
    const category = String(body.category || process.env.IBAN_DEFAULT_CATEGORY || 'VN DIREKT');
    if (!email) return { statusCode: 400, body: 'Missing email' };
    const c = await mjGetContactByEmail(email);
    const lang = (c.props?.sprache || 'de').toLowerCase();
    const templateId = pickTemplate({ language: lang, category });
    const link = c.props?.link_iban;
    if (!templateId || !link) return { statusCode: 400, body: 'Missing template or link' };
    await mjSendEmail({ to: email, subject: 'IBAN-Erhebung', templateId, variables: { link, lang, category } });
    return { statusCode: 200, body: JSON.stringify({ ok:true }) };
  } catch (e) { return { statusCode: 500, body: `error:${e.message}` }; }
};