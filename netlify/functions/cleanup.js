import { getStore } from "@netlify/blobs";

export const handler = async () => {
  const retentionDays = parseInt(process.env.RETENTION_DAYS || "180", 10);
  const cutoff = Date.now() - retentionDays * 24*60*60*1000;
  const store = getStore("iban-store");
  const idx = getStore("iban-index");

  // Hinweis: Blobs-API listet paginiert. Hier einfache Iteration:
  let deleted = 0;
  for await (const entry of store.list({ prefix: "rec/" })) {
    const meta = entry?.metadata || {};
    const ts = meta?.createdAt ? Date.parse(meta.createdAt) : null;
    if (ts && ts < cutoff) {
      // loeschen Record
      await store.delete(entry.key).catch(()=>{});
      // Hash-Index aufraeumen (best effort)
      // (wir haben den Hash nicht ohne Decrypt; Index verweist auf requestId)
      // Wir gehen rueckwaerts: Entry.key -> requestId
      const requestId = entry.key.split("/").pop().replace(".json","");
      // Linear scan im Index vermeiden; in Produktion eigenen Index record pflegen
      deleted++;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ status:"ok", deleted })
  };
};
