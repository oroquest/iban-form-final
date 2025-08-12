import { getStore } from "@netlify/blobs";
import { decrypt } from "../../lib/crypto.js";

// Simple CSV escaper
function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseDate(d) {
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : null;
}

function clientIp(event) {
  // Netlify headers
  const xff = (event.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const nfip = (event.headers["x-nf-client-connection-ip"] || "").trim();
  return xff || nfip || "";
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: "METHOD_NOT_ALLOWED" };
    }

    // Admin-Token Check
    const token = event.headers["x-admin-token"] || event.headers["X-Admin-Token"];
    if (!token || token !== process.env.ADMIN_EXPORT_TOKEN) {
      return { statusCode: 401, body: "UNAUTHORIZED" };
    }

    // Optional: IP-Whitelist
    const whitelist = (process.env.ALLOWED_IPS || "")
      .split(",").map(s => s.trim()).filter(Boolean);
    if (whitelist.length) {
      const ip = clientIp(event);
      if (!whitelist.includes(ip)) {
        return { statusCode: 403, body: "FORBIDDEN_IP" };
      }
    }

    // Filter
    const params = new URLSearchParams(event.rawQuery || event.queryStringParameters || {});
    const wantStatus = params.get("status");              // e.g. received|validated
    const wantBatch  = params.get("batchId");             // optional
    const wantEmail  = params.get("email");               // optional exact match
    const fromTs     = parseDate(params.get("from"));     // ISO date
    const toTs       = parseDate(params.get("to"));       // ISO date (inclusive-ish)
    const limit      = Math.max(1, Math.min(100000, parseInt(params.get("limit") || "100000", 10)));

    const store = getStore("iban-store");
    const rows = [];
    let count = 0;

    // Header
    rows.push([
      "requestId","contactId","email","name","iban","iban_country",
      "submitted_at","status","batchId"
    ].join(","));

    for await (const entry of store.list({ prefix: "rec/" })) {
      if (count >= limit) break;

      // Metadata erlaubt quick pre-filter by createdAt
      const meta = entry?.metadata || {};
      const ts = meta?.createdAt ? Date.parse(meta.createdAt) : null;
      if (fromTs && ts && ts < fromTs) continue;
      if (toTs && ts && ts > toTs) continue;

      const rec = await store.get(entry.key, { type: "json" }).catch(() => null);
      if (!rec) continue;

      // Filters
      if (wantStatus && rec.status !== wantStatus) continue;
      if (wantBatch && (rec.batchId || "") !== wantBatch) continue;
      if (wantEmail && (rec.email || "") !== wantEmail) continue;

      // Decrypt full IBAN
      let iban = "";
      try { iban = decrypt(rec.ibanEnc); } catch { continue; } // skip broken

      const row = [
        csvEscape(rec.requestId || ""),
        csvEscape(rec.contactId || ""),
        csvEscape(rec.email || ""),
        csvEscape(rec.name || ""),
        csvEscape(iban),
        csvEscape(iban.slice(0,2)),
        csvEscape(rec.createdAt || meta.createdAt || ""),
        csvEscape(rec.status || ""),
        csvEscape(rec.batchId || "")
      ].join(",");

      rows.push(row);
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
    // Niemals Voll-IBAN loggen
    console.error("EXPORT_ERR", String(e));
    return { statusCode: 500, body: "SERVER_ERROR" };
  }
};
