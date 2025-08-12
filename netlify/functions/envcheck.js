import { getStore } from "@netlify/blobs";

export const handler = async () => {
  const out = {
    hasDataKey: !!process.env.DATA_KEY,
    hasAdminTokenEnv: !!process.env.ADMIN_EXPORT_TOKEN,
    blobsOk: false,
    blobsSample: 0
  };
  try {
    const store = getStore("iban-store");
    let n = 0;
    for await (const _ of store.list({ prefix: "rec/", limit: 1 })) { n++; }
    out.blobsSample = n;
    out.blobsOk = true;
  } catch (e) {
    out.blobsError = String(e);
  }
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(out)
  };
};
