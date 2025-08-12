import { json, checkOrigin, maskIban } from "../../lib/utils.js";
import { basicFormatCheck, isCountryAllowed, mod97, normalize } from "../../lib/iban.js";
import { sha256Salted, encrypt } from "../../lib/crypto.js";
import { getStore } from "@netlify/blobs";
import { z } from "zod";
import { sendReceipt, notifyOps } from "../../lib/mailjet.js";

const bodySchema = z.object({
  contactId: z.string().min(8),
  iban: z.string().min(15),
  ibanConfirm: z.string().min(15),
  consent: z.boolean()
});

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
    if (!checkOrigin(event)) return json(403, { error: "ORIGIN_FORBIDDEN" });

    const idemKey = event.headers["x-idempotency-key"] || event.headers["X-Idempotency-Key"];
    if (!idemKey) return json(400, { error: "IDEMPOTENCY_KEY_REQUIRED" });

    const input = bodySchema.safeParse(JSON.parse(event.body || "{}"));
    if (!input.success) return json(400, { error: "INVALID_BODY", details: input.error.flatten() });
    const { contactId } = input.data;
    const iban = normalize(input.data.iban);
    const ibanConfirm = normalize(input.data.ibanConfirm);
    if (!input.data.consent) return json(400, { error: "CONSENT_REQUIRED" });
    if (iban !== ibanConfirm) return json(400, { error: "IBAN_MISMATCH" });
    if (!basicFormatCheck(iban)) return json(400, { error: "IBAN_INVALID_FORMAT" });
    if (!isCountryAllowed(iban)) return json(400, { error: "IBAN_COUNTRY_NOT_ALLOWED" });
    if (!mod97(iban)) return json(400, { error: "IBAN_INVALID" });

    const store = getStore("iban-store");    // Netlify Blobs Namespace
    const idx = getStore("iban-index");      // Hash -> pointer

    // Idempotency (simple): if same key seen -> return ok
    const seenKey = await store.get(`idem/${idemKey}`);
    if (seenKey) return json(200, { status:"ok", ibanStatus:"received" });
    await store.set(`idem/${idemKey}`, "1", { metadata: { ts: Date.now() } });

    const ibanHash = sha256Salted(iban);
    const existing = await idx.get(`hash/${ibanHash}`);
    if (existing) return json(409, { error: "IBAN_DUPLICATE" });

    const enc = encrypt(iban);
    const requestId = crypto.randomUUID();
    const record = {
      contactId,
      ibanEnc: enc,
      ibanHash,
      createdAt: new Date().toISOString(),
      status: "received",
      requestId
    };

    // Persist enc record
    await store.set(`rec/${requestId}.json`, JSON.stringify(record), {
      metadata: { contactId, ibanHash, createdAt: record.createdAt }
    });
    await idx.set(`hash/${ibanHash}`, requestId);

    // Notifications (mask only)
    const ibanMask = maskIban(iban);
    // Optionale Bestaetigung: sendReceipt({toEmail, toName, ibanMask, contactId, requestId})
    await notifyOps({ ibanMask, contactId, requestId });

    return json(200, { status:"ok", ibanStatus:"received" });
  } catch (e) {
    console.error("ERR", String(e));
    return json(500, { error: "SERVER_ERROR" });
  }
};
