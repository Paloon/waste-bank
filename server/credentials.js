import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export function hash(value) {
  const salt = randomBytes(16).toString("hex");
  return `s2:${salt}:${scryptSync(value, salt, 32, options).toString("hex")}`;
}
function parts(value, encoded) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    typeof encoded !== "string"
  )
    return null;
  const fields = encoded.split(":");
  const [salt, key] = fields[0] === "s2" ? fields.slice(1) : fields;
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{64}$/.test(key || ""))
    return null;
  return {
    salt,
    key: Buffer.from(key, "hex"),
    options: fields[0] === "s2" ? options : {},
  };
}
// Synchronous compatibility is only used in local setup/tests. HTTP uses verifyAsync.
export function verify(value, encoded) {
  const p = parts(value, encoded);
  return (
    !!p && timingSafeEqual(scryptSync(value, p.salt, 32, p.options), p.key)
  );
}
export async function verifyAsync(value, encoded) {
  const p = parts(value, encoded);
  return (
    !!p && timingSafeEqual(await derive(value, p.salt, 32, p.options), p.key)
  );
}
