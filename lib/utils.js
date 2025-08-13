export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s=>s.trim()).filter(Boolean);

export function json(statusCode, body, extraHeaders={}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

export function checkOrigin(event){
  const origin = event.headers.origin || event.headers.Origin;
  if (!origin || ALLOWED_ORIGINS.length===0) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

export function maskIban(iban){
  const v = iban.replace(/\s+/g,"").toUpperCase();
  if (v.length < 6) return "****";
  const head = v.slice(0,4);
  const tail = v.slice(-4);
  return `${head} **** **** **** ${tail}`;
}
