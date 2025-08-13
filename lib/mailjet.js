import fetch from "node-fetch";

const MJ_BASE = "https://api.mailjet.com/v3.1/send";
const auth = "Basic " + Buffer.from(`${process.env.MJ_API_KEY}:${process.env.MJ_SECRET_KEY}`).toString("base64");

export async function sendReceipt({toEmail, toName, ibanMask, contactId, requestId}){
  if (!toEmail) return; // optional: Empfangsbestaetigung
  const body = {
    Messages: [{
      From: { Email: process.env.SENDER_EMAIL, Name: process.env.SENDER_NAME || "Sikura" },
      To: [{ Email: toEmail, Name: toName || "" }],
      Subject: "IBAN sicher empfangen",
      TextPart: `Ihre IBAN wurde sicher empfangen. Referenz: ${requestId}. IBAN: ${ibanMask}`,
      HTMLPart: `<p>Ihre IBAN wurde sicher empfangen.</p><p>Referenz: <b>${requestId}</b><br/>IBAN: <b>${ibanMask}</b></p>`,
      CustomID: "iban_receipt"
    }]
  };
  const res = await fetch(MJ_BASE, {
    method:"POST",
    headers:{ "Authorization": auth, "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok){
    const t = await res.text().catch(()=>"?");
    throw new Error(`MAILJET_ERROR ${res.status} ${t}`);
  }
}

export async function notifyOps({ibanMask, contactId, requestId}){
  // Alternative: interne Notification (keine Voll-IBAN)
  return Promise.resolve();
}
