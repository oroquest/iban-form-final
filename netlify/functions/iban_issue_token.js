
const { mjGetContactByEmail, mjUpdateContactProps, mjSendEmail, buildIbanLink, addDaysIso, pickTemplate } = require('./_lib');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const body = event.headers['content-type']?.includes('application/json') ? JSON.parse(event.body||'{}') : Object.fromEntries(new URLSearchParams(event.body||''));
    const email = String(body.email||'').trim();
    const id = body.id ?? '';
    const lang = (body.lang || 'de').toLowerCase();
    const category = String(body.category || process.env.IBAN_DEFAULT_CATEGORY || 'VN DIREKT');
    const send = String(body.send||'').toLowerCase() in { '1':1, 'true':1, 'yes':1 };

    if (!email) return { statusCode: 400, body: 'Missing email' };

    const contact = await mjGetContactByEmail(email);

    const token = require('crypto').randomBytes(16).toString('hex');
    const expires = addDaysIso(Number(process.env.IBAN_TOKEN_DAYS||7));
    const baseUrl = process.env.BASE_IBAN_URL || 'https://iban.sikuralife.com';
    const url = buildIbanLink({ baseUrl, id, token, email, lang });

    await mjUpdateContactProps(contact.id, {
      token_iban: token,
      token_iban_expiry: expires,
      token_iban_used_at: '',
      link_iban: url,
      sprache: lang,
      iban_status: 'issued'
    });

    let sent = false;
    if (send) {
      const templateId = pickTemplate({ language: lang, category });
      if (!templateId) throw new Error('template_missing');
      await mjSendEmail({
        to: email,
        subject: 'IBAN-Erhebung',
        templateId,
        variables: { link: url, id, lang, category }
      });
      sent = true;
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true, token, expiresAt: expires, url, sent }) };
  } catch (e) {
    return { statusCode: 500, body: `error:${e.message}` };
  }
};
