
// netlify/functions/iban_check.js
exports.handler = async (event) => {
  const query = event.queryStringParameters || {};
  let body = {};
  try { body = JSON.parse(event.body) } catch(e) {}

  const id = query.id || body.id;
  const token = query.token || body.token;
  const em = query.em || body.em || query.email || body.email;
  const lang = query.lang || body.lang || 'de';

  if (!id || !token || !em) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Missing token/email/id" }) };
  }

  // ENFORCE_EXPIRY abgeschaltet
  const ENFORCE_EXPIRY = false;
  
  // Debug Info
  const debug = process.env.DEBUG === '1';
  if (debug) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, debug: { query, body, id, token, em, lang } })
    };
  }

  // Simulierte Rückgabe
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      data: {
        creditor_no: "133",
        firstname: "Jagdeep",
        lastname: "Singh",
        street: "UPD_VN_DIREKT_EN",
        street_no: "99",
        zip: "24000",
        city: "Zürich",
        country: "ITALIA"
      }
    })
  };
};
