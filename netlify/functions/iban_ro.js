// netlify/functions/iban_ro.js
// Example read-only endpoint if you had one; now without node-fetch dependency.
exports.handler = async () => {
  return { statusCode: 200, body: JSON.stringify({ ok:true, note: 'iban_ro alive (no node-fetch)' }) };
};
