let generation = 0,
  authQueue = Promise.resolve();
const pending = new Set();
const channel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("waste-bank-session")
    : null;
if (channel)
  channel.onmessage = () => {
    invalidateRequests();
    window.dispatchEvent(new Event("session-replaced"));
  };
export function invalidateRequests() {
  generation++;
  for (const c of pending) c.abort();
  pending.clear();
}
export async function api(path, body) {
  const epoch = generation,
    auth = ["identify", "register", "login", "logout"].includes(path),
    controller = new AbortController();
  if (!auth) pending.add(controller);
  const execute = async () => {
    if (path !== "logout" && epoch !== generation)
      throw Object.assign(new Error("ยกเลิกแล้ว"), { cancelled: true });
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch("/api/" + path, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        keepalive: path === "logout",
      });
      const data = await response.json();
      if (path !== "logout" && epoch !== generation)
        throw Object.assign(new Error("ยกเลิกแล้ว"), { cancelled: true });
      if (!response.ok) {
        if (data.code === "SESSION_EXPIRED")
          window.dispatchEvent(new Event("session-expired"));
        throw Object.assign(new Error(data.error || "โหลดข้อมูลไม่สำเร็จ"), {
          serverError: true,
        });
      }
      if (auth) channel?.postMessage({ changed: true });
      return data;
    } catch (error) {
      if (error.serverError || error.cancelled) throw error;
      throw Object.assign(
        new Error("เชื่อมต่อไม่ได้ กรุณาลองรายการเดิมอีกครั้ง"),
        { cancelled: epoch !== generation },
      );
    } finally {
      clearTimeout(timeout);
      pending.delete(controller);
    }
  };
  // Cookie-changing requests must finish in order, including logout after a slow login.
  if (auth) {
    const result = authQueue.then(execute, execute);
    authQueue = result.catch(() => {});
    return result;
  }
  return execute();
}
