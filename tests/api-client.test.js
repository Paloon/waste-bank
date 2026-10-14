import test from "node:test";
import assert from "node:assert/strict";
import { createApiClient } from "../src/api/client.js";

const response = (data = {}, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => data,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("concurrent identical reads share transport only while pending; writes never share", async () => {
  const waiting = deferred();
  let calls = 0;
  const client = createApiClient({
    fetcher: async () => {
      calls++;
      await waiting.promise;
      return response({ balance: 50 });
    },
  });
  const a = client.api("student?page=0");
  const b = client.api("student?page=0");
  assert.equal(a, b);
  assert.equal(calls, 1);
  waiting.resolve();
  assert.equal((await a).balance, 50);
  await client.api("student?page=0");
  assert.equal(calls, 2);
  await Promise.all([
    client.api("action", { key: "first" }),
    client.api("action", { key: "first" }),
  ]);
  assert.equal(calls, 4);
});

test("account invalidation rejects stale successful responses and cannot reuse old read", async () => {
  const waiting = deferred();
  let calls = 0;
  const client = createApiClient({
    fetcher: async () => {
      calls++;
      await waiting.promise;
      return response({ name: "old account" });
    },
  });
  const old = client.api("student");
  client.invalidateRequests();
  const current = client.api("student");
  const rejection = assert.rejects(old, (e) => e.cancelled === true);
  waiting.resolve();
  await rejection;
  await current;
  assert.equal(calls, 2);
});

test("caller abort is cancellation; timeout/503 are retryable without session expiry", async () => {
  const events = [];
  const client = createApiClient({
    timeoutMs: 5,
    dispatch: (event) => events.push(event),
    fetcher: (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("abort")), {
          once: true,
        }),
      ),
  });
  const controller = new AbortController();
  const read = client.api("admin", undefined, { signal: controller.signal });
  const cancelled = assert.rejects(read, (e) => e.cancelled === true);
  controller.abort();
  await cancelled;
  await assert.rejects(client.api("admin"), (e) => e.retryable && !e.cancelled);
  assert.deepEqual(events, []);
  const unavailable = createApiClient({
    dispatch: (event) => events.push(event),
    fetcher: async () => response({ code: "DATABASE_UNAVAILABLE" }, 503),
  });
  await assert.rejects(
    unavailable.api("student"),
    (e) => e.retryable && e.status === 503,
  );
  assert.deepEqual(events, []);
});

test("cookie changes remain ordered and wrong PIN does not expire existing session", async () => {
  const login = deferred();
  const calls = [],
    events = [];
  const client = createApiClient({
    dispatch: (event) => events.push(event),
    fetcher: async (url) => {
      calls.push(url);
      if (url.endsWith("login")) {
        await login.promise;
        return response({ error: "wrong PIN" }, 401);
      }
      return response();
    },
  });
  const rejected = assert.rejects(
    client.api("login", { pin: "invalid" }),
    (e) => e.status === 401,
  );
  const logout = client.api("logout", {});
  await Promise.resolve();
  assert.deepEqual(calls, ["/api/login"]);
  login.resolve();
  await rejected;
  await logout;
  assert.deepEqual(calls, ["/api/login", "/api/logout"]);
  assert.deepEqual(events, []);
  const expired = createApiClient({
    dispatch: (event) => events.push(event),
    fetcher: async () => response({ code: "SESSION_EXPIRED" }, 401),
  });
  await assert.rejects(expired.api("student"));
  assert.deepEqual(events, ["session-expired"]);
});
