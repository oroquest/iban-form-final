import crypto from "node:crypto";

// AES-256-GCM encryption with random IV, DATA_KEY (base64) or placeholder if KMS used externally
function getKey(){
  const k = process.env.DATA_KEY;
  if (!k) throw new Error("DATA_KEY missing (or implement KMS client in crypto.js)");
  const buf = k.startsWith("base64:") ? Buffer.from(k.slice(7), "base64") : Buffer.from(k, "hex");
  if (buf.length !== 32) throw new Error("DATA_KEY must be 32 bytes");
  return buf;
}

export function encrypt(plaintext){
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64"); // [12|16|N]
}

export function decrypt(b64){
  const key = getKey();
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0,12);
  const tag = buf.subarray(12,28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

export function sha256Salted(value){
  const salt = process.env.HASH_SALT || "";
  return crypto.createHash("sha256").update(salt + value, "utf8").digest("hex");
}
