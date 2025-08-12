import crypto from "node:crypto";
import { json, checkOrigin, maskIban } from "../../lib/utils.js";
import { basicFormatCheck, isCountryAllowed, mod97, normalize } from "../../lib/iban.js";
import { sha256Salted, encrypt } from "../../lib/crypto.js";
import { getStore } from "@netlify/blobs";
import { z } from "zod";
import { sendReceipt, notifyOps, upsertToListWithProps } from "../../lib/mailjet.js"; // upsertToListWithProps hast du zuvor ergänzt

const bodySchema = z.object({
  contactId: z.string().min(8),
  iban: z.string().min(15),
  ibanConfirm: z.string().min(15),
  consent: z.boolean(),
  // NEU/optional: falls bereits eingebunden (oder spaeter via Token-Introspect setzen)
  email: z.string().email().optional(),
  name: z.string().optional(),
  batchId: z.string().optional()
});

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
    if (!checkOrigin(event)) return json(403, { error: "ORIGIN_FORBIDDEN" });

    const idemKey = event.headers["x-idempotency-key"] || event.headers["X-Idempotency-Key"];
    if (!idemKey) return json(400, { error: "IDEMPOTENCY_KEY_REQUIRED" });

    const parsed = bodySchema.safeParse(JSON.parse(event.body || "{}"));
    if (!parsed.success) return json(400, { error: "INVALID_BODY", details: parsed.error.flatten() });

    const { contactId, email, name } = parsed.data;
    const batchId = parsed.data.batchId || event.headers["x-batch-id"] || "";
    const iban = normalize(parsed.data.iban);
    const ibanConfirm = normalize(parsed.data.ibanConfirm);

    if (!parsed.data.consent) return json(400, { error: "CONSENT_REQUIRED" });
    if (iban !== ibanConfirm) return json(400, { error: "IBAN_MISMATCH" });
    if (!basicFormatCheck(iban)) return json(400, { error: "IBAN_INVALID_FORMAT" });
    if (!isCountryAllowed(iban)) return json(400, { error: "IBAN_COUNTRY_NOT_ALLOWED" });
    if (!mod97(iban)) return json(400, { error: "IBAN_INVALID" });

    const store = getStore("iban-store");
    const idx = getStore("iban-index");

    // Idempotency
    const seenKey = await store.get(`idem/${idemKey}`);
    if (seenKey) return json(200, { status: "ok", ibanStatus: "received" });
    await store.set(`idem/${idemKey}`, "1", { metadata: { ts: Date.now() } });

    // Duplicate
    const ibanHash = sha256Salted(iban);
    const existing = await idx.get(`hash/${ibanHash}`);
    if (existing) return json(409, { error: "IBAN_DUPLICATE" });

    const enc = encrypt(iban);
    const requestId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const record = {
      requestId,
      contactId,
      email: email || "",
      name: name || "",
      batchId: String(batchId || ""),
      ibanEnc: enc,
      ibanHash,
      createdAt: nowIso,
      status: "received"
    };

    await store.set(`rec/${requestId}.json`, JSON.stringify(record), {
      metadata: { contactId, ibanHash, createdAt: nowIso }
    });
    await idx.set(`hash/${ibanHash}`, requestId);

    // Mailjet Contact Properties (ohne Voll-IBAN)
    const ibanMask = maskIban(iban);
    if (email) {
      await upsertToListWithProps({
        email,
        name: name || "",
        properties: {
          sik_contact_id: contactId,
          iban_status: "received",
          iban_mask: ibanMask,
          iban_country: iban.slice(0,2),
          iban_submitted_at: nowIso,
          ...(batchId ? { iban_batch: String(batchId) } : {})
        }
      });
    }

    // Optionale Bestaetigung (nur Maske)
    // await sendReceipt({ toEmail: email, toName: name, ibanMask, contactId, requestId });
    await notifyOps({ ibanMask, contactId, requestId });

    return json(200, { status: "ok", ibanStatus: "received" });
  } catch (e) {
    console.error("ERR", String(e)); // nie Voll-IBAN loggen
    return json(500, { error: "SERVER_ERROR" });
  }
};
