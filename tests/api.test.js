import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../server/store.js";
import { createApp } from "../server/app.js";
import { randomUUID, createHash } from "node:crypto";
test("HTTP sessions, retained student access, authorization, validation and sensitive actions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-http-")),
    store = createStore(dir, { demo: true }),
    drive = { configured: false, connected: async () => false };
  const server = createApp({ store, drive }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const call = (path, body, cookie, headers = {}) =>
    fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const getCookie = (response) =>
    response.headers
      .getSetCookie()
      .find(
        (x) => x.startsWith("eco_session=") && !x.startsWith("eco_session=;"),
      )
      ?.split(";")[0];
  try {
    const lookup = await call("lookup", { id: "65001" });
    assert.equal(lookup.status, 200);
    assert.equal(lookup.headers.get("set-cookie"), null);
    let login = await call("identify", { id: "65001" }),
      cookie = getCookie(login);
    assert.ok(cookie);
    assert.match(login.headers.get("set-cookie"), /HttpOnly/);
    assert.equal((await call("student", null, cookie)).status, 200);
    assert.equal((await call("admin", null, cookie)).status, 403);
    await call("logout", {}, cookie);
    assert.equal((await call("student", null, cookie)).status, 401);
    assert.equal((await call("session", {}, cookie)).status, 401);
    for (const absolute of [false, true]) {
      const response = await call("identify", { id: "65003" }),
        sessionCookie = getCookie(response),
        token = sessionCookie.split("=")[1];
      const id = "session:" + createHash("sha256").update(token).digest("hex");
      const value = await store.control("get", { id });
      await store.control("put", {
        id,
        value: {
          ...value,
          [absolute ? "absolute" : "expires"]: Date.now() - 1,
        },
      });
      assert.equal(
        (await call("session", {}, sessionCookie)).status,
        401,
        absolute ? "absolute timeout" : "server idle timeout",
      );
    }
    login = await call("identify", { id: "65001" });
    cookie = getCookie(login);
    const key = Date.now() + ":" + randomUUID(),
      request = { key, action: "redeem", payload: { id: "r1" } };
    assert.equal((await call("action", request, cookie)).status, 200);
    assert.equal((await call("action", request, cookie)).status, 200);
    assert.equal(
      (await call("action", { ...request, payload: { id: "r2" } }, cookie))
        .status,
      409,
    );
    assert.equal(
      (await call("action", { ...request, key: "1:" + randomUUID() }, cookie))
        .status,
      409,
    );
    assert.equal(
      (
        await call(
          "action",
          {
            key: Date.now() + ":" + randomUUID(),
            action: "submit",
            payload: {
              category: "กระดาษ",
              image: "data:image/png;base64,aGVsbG8=",
            },
          },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call("identify", { id: "65001" }, null, {
          Origin: "https://evil.invalid",
        })
      ).status,
      403,
    );
    store.transact((s) => {
      s.students.find((x) => x.id === "65001").status = "Inactive";
    });
    assert.equal((await call("student", null, cookie)).status, 401);
    const pin = readFileSync(join(dir, "demo-credentials.txt"), "utf8").match(
      /PIN: (\d+)/,
    )[1];
    login = await call("login", { id: "teacher.mali", pin });
    cookie = getCookie(login);
    assert.equal(login.status, 200);
    assert.equal((await call("admin", null, cookie)).status, 200);
    store.transact((s) => {
      for (let i = 0; i < 60; i++)
        s.students.push({
          id: String(90000 + i),
          name: "Pagination " + i,
          grade: "1",
          room: "1",
          number: i + 1,
          status: "Inactive",
        });
    });
    const firstPage = await (
      await call("admin?tab=students&page=0", null, cookie)
    ).json();
    const nextPage = await (
      await call("admin?tab=students&page=1", null, cookie)
    ).json();
    assert.equal(firstPage.students.length, 50);
    assert.equal(firstPage.hasMore, true);
    assert.equal(nextPage.hasMore, false);
    assert.ok(
      !nextPage.students.some((p) =>
        firstPage.students.some((x) => x.id === p.id),
      ),
    );
    const deletion = {
      key: Date.now() + ":" + randomUUID(),
      action: "deleteStudents",
      payload: { ids: ["65002"], confirm: true, pin: "wrong" },
    };
    assert.equal((await call("action", deletion, cookie)).status, 403);
    assert.ok(store.read().students.some((x) => x.id === "65002"));
    store.transact((s) => {
      s.staff[0].authVersion = 1;
    });
    assert.equal((await call("admin", null, cookie)).status, 401);
    assert.equal((await call("session", {}, cookie)).status, 401);
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
