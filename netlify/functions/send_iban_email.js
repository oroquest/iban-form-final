// send_iban_email.js - patched with contactId flow

async function mjGetContactIdByEmail(email) {
  const r = await fetchFn(`https://api.mailjet.com/v3/REST/contact/?ContactEmail=${encodeURIComponent(email)}`, {
    headers: { Authorization: mjAuth }
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Mailjet contact fetch failed: ${r.status} ${t}`);
  }
  const j = await r.json();
  const id = j?.Data?.[0]?.ID;
  if (!id) throw new Error(`Mailjet contact not found for ${email}`);
  return id;
}

async function mjUpdateContactDataById(contactId, kv) {
  const Data = Object.entries(kv).map(([Name, Value]) => ({ Name, Value: String(Value ?? '') }));
  const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, {
    method: 'PUT',
    headers: { Authorization: mjAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Data })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Mailjet contactdata update failed: ${r.status} ${t}`);
  }
}

// Handler (Ausschnitt)
const contactId = await mjGetContactIdByEmail(email);
await mjUpdateContactDataById(contactId, {
  token_iban: token,
  token_iban_expiry: expiresISO,
  token_iban_used_at: ''
});
