import { getStore } from "@netlify/blobs";
import { decrypt } from "../../lib/crypto.js";

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function parseDate(d) {
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : null;
}
function clientIp(event) {
  const h = event.headers || {};
  const xff = (h["x-forwarded-for"] || h["X-Forwarded-For"] || "").toString().split(",")[0].trim();
  const nfip = (h["x-nf-client-connection-ip"] || "").toString().trim();
  return xff || nfip || "";
}
function getParams(event) {
  try {
    if (event.rawUrl) return new URL(event.rawUrl).searchParams;
  } catch {}
  // Fallback (Netlify v2/v3): Objekt -> URLSearchParams
  const q = (event.queryStringParameters && typeof event.queryStringParameters === "object")
    ? event.queryStringParameters : {};
  return new URLSearchParams(q);
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: "METHOD_NOT_ALLOWED" };
    }

    const params = getParams(event);

    // Admin-Token: Header ODER Query (?admin_token=...)
    const h = event.headers || {};
    const token = h["x-admin-token"] || h["X-Admin-Token"] || params.get("admin_token");
    if (!token || token !== process.env.ADMIN_EXPORT_TOKEN) {
      return { statusCode: 401, body: "UNAUTHORIZED" };
    }

    // Optional: IP-Whitelist
    const whitelist = (process.env.ALLOWED_IPS || "")
      .split(",").map(s => s.trim()).filter(Boolean);
    if (whitelist.length) {
      const ip = clientIp(event);
      if (!whitelist.includes(ip)) return { statusCode: 403, body: "FORBIDDEN_IP" };
    }

    const wantStatus = params.get("status");      // received|validated
    const wantBatch  = params.get("batchId");     // optional
    const wantEmail  = params.get("email");       // optional exact
    const fromTs     = parseDate(params.get("from"));
    const toTs       = parseDate(params.get("to"));
    const limit      = Math.max(1, Math.min(100000, parseInt(params.get("limit") || "100000", 10)));

    const store = getStore("iban-store");
    const rows = [];
    let count = 0;

    rows.push([
      "requestId","contactId","email","name","iban","iban_country",
      "submitted_at","status","batchId"
    ].join(","));

    // Falls Namespace leer ist, liefert list() einfach nichts – kein Fehler.
    for await (const entry of store.list({ prefix: "rec/" })) {
      if (count >= limit) break;

      const meta = entry?.metadata || {};
      const ts = meta?.createdAt ? Date.parse(meta.createdAt) : null;
      if (fromTs && ts && ts < fromTs) continue;
      if (toTs && ts && ts > toTs) continue;

      // Best effort JSON-Load
      let rec;
      try { rec = await store.get(entry.key, { type: "json" }); } catch { continue; }
      if (!rec || typeof rec !== "object") continue;

      if (wantStatus && rec.status !== wantStatus) continue;
      if (wantBatch && (rec.batchId || "") !== wantBatch) continue;
      if (wantEmail && (rec.email || "") !== wantEmail) continue;

      // Decrypt Voll-IBAN – falls KEY fehlt/falsch: überspringen statt 500
      let iban = "";
      try { iban = decrypt(rec.ibanEnc); } catch { continue; }

      rows.push([
        csvEscape(rec.requestId || ""),
        csvEscape(rec.contactId || ""),
        csvEscape(rec.email || ""),
        csvEscape(rec.name || ""),
        csvEscape(iban),
        csvEscape(iban.slice(0,2)),
        csvEscape(rec.createdAt || meta.createdAt || ""),
        csvEscape(rec.status || ""),
        csvEscape(rec.batchId || "")
      ].join(","));

      count++;
    }

    const csv = rows.join("\n");
    const now = new Date();
    const fname = `iban-export_${now.toISOString().replace(/[:.]/g,"-")}.csv`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${fname}"`
      },
      body: csv
    };
  } catch (e) {
    // keine sensitiven Daten loggen
    console.error("EXPORT_ERR", e?.message || String(e));
    return { statusCode: 500, body: "SERVER_ERROR" };
  }
};
