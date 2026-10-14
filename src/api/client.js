/** Session-scoped transport: only concurrent GETs without caller signals are shared. */
export function createApiClient({
  fetcher = fetch,
  dispatch = () => {},
  onAuthChange = () => {},
  timeoutMs = 60_000,
} = {}) {
  let generation = 0;
  let authQueue = Promise.resolve();
  const pending = new Set();
  const reads = new Map();
  const cancelled = () =>
    Object.assign(new Error("ยกเลิกแล้ว"), { cancelled: true });

  function invalidateRequests() {
    generation++;
    for (const controller of pending) controller.abort();
    pending.clear();
    reads.clear();
  }

  function api(path, body, { signal } = {}) {
    const epoch = generation;
    const auth = ["identify", "register", "login", "logout"].includes(path);
    const readKey = !body && !signal ? `${epoch}:${path}` : null;
    if (readKey && reads.has(readKey)) return reads.get(readKey);
    const controller = new AbortController();
    if (!auth) pending.add(controller);
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });

    const execute = async () => {
      let timeout;
      try {
        if (signal?.aborted || (path !== "logout" && epoch !== generation))
          throw cancelled();
        timeout = setTimeout(abort, timeoutMs);
        const response = await fetcher("/api/" + path, {
          method: body ? "POST" : "GET",
          headers: body ? { "Content-Type": "application/json" } : {},
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
          keepalive: path === "logout",
        });
        const data = await response.json().catch((error) => {
          if (response.ok) throw error;
          return {};
        });
        if (signal?.aborted || (path !== "logout" && epoch !== generation))
          throw cancelled();
        if (!response.ok) {
          if (
            (!auth && response.status === 401) ||
            data.code === "SESSION_EXPIRED"
          )
            dispatch("session-expired");
          throw Object.assign(new Error(data.error || "โหลดข้อมูลไม่สำเร็จ"), {
            serverError: true,
            status: response.status,
            code: data.code,
            retryable: response.status >= 500,
            eventId: data.eventId,
            fields: data.fields,
          });
        }
        if (auth) onAuthChange();
        return data;
      } catch (error) {
        if (error.serverError || error.cancelled) throw error;
        if (signal?.aborted || epoch !== generation) throw cancelled();
        throw Object.assign(
          new Error("เชื่อมต่อไม่ได้ กรุณาลองรายการเดิมอีกครั้ง"),
          {
            retryable: true,
            cancelled: false,
          },
        );
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        pending.delete(controller);
      }
    };
    let result;
    if (auth) {
      result = authQueue.then(execute, execute);
      authQueue = result.catch(() => {});
    } else result = execute();
    if (readKey) {
      reads.set(readKey, result);
      const remove = () => {
        if (reads.get(readKey) === result) reads.delete(readKey);
      };
      result.then(remove, remove);
    }
    return result;
  }
  return { api, invalidateRequests };
}
