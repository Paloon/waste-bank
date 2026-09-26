import { randomUUID } from "node:crypto";
export async function audit(store, action, actor, target = "", details = {}) {
  await store.transact(
    (s) => {
      s.audit.unshift({
        id: randomUUID(),
        at: new Date().toISOString(),
        staff:
          actor?.role === "student"
            ? "นักเรียน " + actor.id
            : actor?.id || "system",
        action,
        target,
        before: null,
        after: details,
        reason: "",
      });
    },
    { audit: { limit: 0 } },
  );
}
export async function report(store, code) {
  // Never log bodies, PINs, cookies, tokens, names, photos or upstream error text.
  const at = new Date().toISOString();
  console.error(JSON.stringify({ event: "waste-bank-error", code, at }));
  try {
    await store.control("put", {
      id: "health:error",
      value: { code, at, expires: Date.now() + 30 * 86400000 },
    });
  } catch {}
}
