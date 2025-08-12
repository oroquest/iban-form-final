// iban_submit.js - patched with contactId flow

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

const contactId = await mjGetContactIdByEmail(email);

// Lesen
const r = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, {
  headers: { Authorization: mjAuth }
});

// Schreiben
const u = await fetchFn(`https://api.mailjet.com/v3/REST/contactdata/${encodeURIComponent(contactId)}`, {
  method:'PUT',
  headers:{ Authorization: mjAuth, 'Content-Type':'application/json' },
  body: JSON.stringify({ Data })
});
