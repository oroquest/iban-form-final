// IBAN Helpers: Normalize, Mod97, Country gate
export function normalize(iban){ return iban.replace(/\s+/g,"").toUpperCase(); }

export function isCountryAllowed(iban){
  const allowed = (process.env.IBAN_ALLOWED_COUNTRIES || "CH").split(",").map(s=>s.trim().toUpperCase());
  return allowed.includes(normalize(iban).slice(0,2));
}

export function mod97(iban){
  const v = normalize(iban);
  const rearranged = v.slice(4) + v.slice(0,4);
  const expanded = rearranged.replace(/[A-Z]/g, (c)=> (c.charCodeAt(0) - 55).toString());
  // chunked modulo to avoid bigints
  let remainder = 0;
  for (let i=0; i<expanded.length; i+=7) {
    remainder = parseInt(String(remainder) + expanded.substring(i, i+7), 10) % 97;
  }
  return remainder === 1;
}

export function basicFormatCheck(iban){
  const v = normalize(iban);
  if (v.length < 15 || v.length > 34) return false;
  return /^([A-Z]{2}\d{2}[0-9A-Z]+)$/.test(v);
}
