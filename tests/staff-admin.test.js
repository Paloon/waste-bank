import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../server/store.js";
import { createApp } from "../server/app.js";
import { applyStaffChange } from "../server/staff-admin.js";

test("applyStaffChange keeps one active admin and never edits as a non-admin", () => {
  const staff = [
    { id: "boss", name: "Boss", role: "admin", enabled: true, pin: "x" },
    { id: "helper", name: "Helper", enabled: true, pin: "y" },
  ];
  assert.throws(
    () =>
      applyStaffChange(staff, "boss", {
        op: "update",
        id: "boss",
        enabled: false,
      }),
    /อย่างน้อย 1 บัญชี/,
  );
  assert.throws(
    () =>
      applyStaffChange(staff, "boss", {
        op: "update",
        id: "boss",
        role: "staff",
      }),
    /อย่างน้อย 1 บัญชี/,
  );
  assert.throws(
    () =>
      applyStaffChange(
        staff,
        "helper",
        { op: "create", id: "new.one", name: "New" },
        "h",
      ),
    /เฉพาะผู้ดูแลระบบ/,
  );
  assert.throws(
    () =>
      applyStaffChange(
        staff,
        "boss",
        { op: "create", id: "helper", name: "Dup" },
        "h",
      ),
    /มีชื่อบัญชีนี้แล้ว/,
  );
  const result = applyStaffChange(staff, "boss", {
    op: "update",
    id: "helper",
    enabled: false,
  });
  assert.equal(staff[1].enabled, false);
  assert.equal(
    staff[1].authVersion,
    1,
    "disabling ends that account's sessions",
  );
  assert.equal(
    JSON.stringify(result).includes('"y"'),
    false,
    "no PIN in audit details",
  );
});

test("admins manage staff over HTTP; staff cannot; PIN changes end old sessions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-staff-")),
    store = createStore(dir, { demo: true }),
    drive = { configured: false, connected: async () => false };
  const server = createApp({ store, drive }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const call = (path, body, cookie) =>
    fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const login = async (id, pin) => {
    const r = await call("login", { id, pin });
    return {
      status: r.status,
      body: await r.json(),
      cookie: r.headers
        .getSetCookie()
        .find(
          (x) => x.startsWith("eco_session=") && !x.startsWith("eco_session=;"),
        )
        ?.split(";")[0],
    };
  };
  try {
    const pin = readFileSync(join(dir, "demo-credentials.txt"), "utf8").match(
      /PIN: (\d+)/,
    )[1];
    const admin = await login("teacher.mali", pin);
    assert.equal(admin.body.admin, true);
    const list = await (
      await call("staff-accounts", null, admin.cookie)
    ).json();
    assert.deepEqual(
      list.accounts.map((a) => a.id),
      ["teacher.mali"],
    );
    assert.equal(
      JSON.stringify(list).includes("s2:"),
      false,
      "no PIN hashes leave the server",
    );

    const wrongPin = await call(
      "staff-accounts",
      {
        op: "create",
        id: "teacher.new",
        name: "ครูใหม่",
        newPin: "12345678",
        pin: "000000",
      },
      admin.cookie,
    );
    assert.equal(wrongPin.status, 403);
    const created = await call(
      "staff-accounts",
      {
        op: "create",
        id: "teacher.new",
        name: "ครูใหม่",
        newPin: "12345678",
        pin,
      },
      admin.cookie,
    );
    assert.equal(created.status, 200);

    const helper = await login("teacher.new", "12345678");
    assert.equal(helper.body.admin, false);
    assert.equal(
      (await call("staff-accounts", null, helper.cookie)).status,
      403,
    );
    assert.equal(
      (
        await call(
          "staff-accounts",
          { op: "update", id: "teacher.mali", enabled: false, pin: "12345678" },
          helper.cookie,
        )
      ).status,
      403,
    );
    assert.equal((await call("admin", null, helper.cookie)).status, 200);

    // The admin resets the helper's PIN: the helper's open session ends.
    assert.equal(
      (
        await call(
          "staff-accounts",
          { op: "update", id: "teacher.new", newPin: "87654321", pin },
          admin.cookie,
        )
      ).status,
      200,
    );
    assert.equal((await call("admin", null, helper.cookie)).status, 401);
    assert.equal((await login("teacher.new", "12345678")).status, 401);
    const again = await login("teacher.new", "87654321");
    assert.equal(again.status, 200);

    // Changing your own PIN keeps this browser signed in.
    const own = await call(
      "staff-accounts",
      { op: "ownPin", newPin: "11112222", pin: "87654321" },
      again.cookie,
    );
    assert.equal(own.status, 200);
    const renewed = own.headers
      .getSetCookie()
      .find(
        (x) => x.startsWith("eco_session=") && !x.startsWith("eco_session=;"),
      )
      ?.split(";")[0];
    assert.equal((await call("admin", null, renewed)).status, 200);
    assert.equal((await call("admin", null, again.cookie)).status, 401);

    const audit = store.read().audit.map((a) => a.action);
    assert.ok(audit.includes("staff:create"));
    assert.ok(audit.includes("staff:update"));
    assert.ok(audit.includes("staff:ownPin"));
  } finally {
    server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
