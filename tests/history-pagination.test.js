import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTestDatabase } from "./pglite.mjs";
import { emptyState, selectState, records } from "../server/state.js";
import { studentHistory, submissionView } from "../server/views.js";
import { createCloudStore } from "../server/cloud-store.js";
import { policy } from "../shared/policy.js";
function fixture() {
  const s = emptyState();
  s.students = [
    { id: "a", name: "A", status: "Active" },
    { id: "b", name: "B", status: "Active" },
  ];
  s.ledger = Array.from({ length: 70 }, (_, i) => ({
    id: "l" + i,
    student: "a",
    amount: 1,
    type: "recycle",
    at: "2026-10-01T00:00:00Z",
  }));
  s.submissions = Array.from({ length: 244 }, (_, i) => ({
    id: "s" + String(i).padStart(3, "0"),
    student: "a",
    status: ["Pending", "Approved", "Rejected", "Cancelled"][i % 4],
    at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
    image: "drive:secret" + i,
  }));
  s.submissions.push({
    id: "foreign",
    student: "b",
    status: "Rejected",
    at: "2026-10-13T00:00:00Z",
    image: "drive:foreign",
  });
  return s;
}
test("all-history counts and filtered pages are independent of wallet page, SQL parity and role denial", async () => {
  const s = fixture(),
    local = { read: async (scope) => selectState(s, scope) };
  const db = await createTestDatabase();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls;",
    );
    await db.exec(
      readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
    );
    await db.query("select wb_initialize($1)", [records(s)]);
    const cloud = createCloudStore({
      url: "https://test.invalid",
      key: "test",
      fetcher: async (url, options) => {
        const a = JSON.parse(options.body);
        assert.ok(url.endsWith("/rpc/wb_student_history"));
        const r = await db.query(
          "select wb_student_history($1,$2,$3,$4,$5) result",
          [
            a.student_id,
            a.wallet_page,
            a.submission_page,
            a.submission_status,
            a.page_size,
          ],
        );
        return Response.json(r.rows[0].result);
      },
    });
    for (const status of ["", "Pending", "Approved", "Rejected", "Cancelled"]) {
      for (const submissionPage of [0, 1, 2]) {
        const opts = { page: 1, submissionPage, submissionStatus: status };
        const a = await studentHistory(local, "a", opts),
          b = await studentHistory(cloud, "a", opts);
        assert.deepEqual(b.submissionStatusCounts, {
          All: 244,
          Pending: 61,
          Approved: 61,
          Rejected: 61,
          Cancelled: 61,
        });
        assert.deepEqual(b.submissionStatusCounts, a.submissionStatusCounts);
        assert.deepEqual(b.submissions, a.submissions);
        assert.deepEqual(b.ledger, a.ledger);
        assert.equal(b.rank, a.rank);
        assert.ok(b.submissions.length <= policy.pageSize + 1);
        assert.ok(
          b.submissions.every(
            (x) => x.student === "a" && (!status || x.status === status),
          ),
        );
      }
    }
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      await assert.rejects(
        db.query("select wb_student_history('a',0,0,'',50)"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.equal(
      (
        await db.query(
          "select wb_student_history('a',0,0,'Rejected',50) result",
        )
      ).rows[0].result.submissionStatusCounts.Rejected,
      61,
    );
  } finally {
    await db.close();
  }
});
test("submission media response omits private Drive deletion identifiers", () => {
  const result = submissionView({
    id: "s",
    image: "drive:private",
    evidenceDeletionPending: ["secret1", "secret2"],
  });
  assert.equal(result.evidenceDeletionPendingCount, 2);
  assert.equal(result.evidenceDeletionPending, undefined);
  assert.equal(result.image, "/api/media/submission/s");
});
test("cloud outage never silently falls back; missing RPC uses status-only count batches", async () => {
  const s = fixture();
  let paths = [];
  const store = createCloudStore({
    url: "https://test.invalid",
    key: "test",
    fetcher: async (url, options) => {
      paths.push(url);
      if (url.endsWith("/rpc/wb_student_history"))
        return Response.json({ code: "PGRST202" }, { status: 404 });
      if (url.endsWith("/rpc/wb_summary"))
        return Response.json({
          students: s.students.map((x) => ({
            ...x,
            balance: x.id === "a" ? 70 : 0,
            earned: x.id === "a" ? 70 : 0,
          })),
        });
      if (url.endsWith("/rpc/wb_snapshot"))
        return Response.json({
          version: 1,
          value: selectState(s, JSON.parse(options.body).scope),
        });
      const p = new URL(url).searchParams;
      assert.equal(p.get("select"), "status");
      assert.equal(p.get("student"), "eq.a");
      return Response.json(
        p.get("offset") === "0"
          ? s.submissions
              .filter((x) => x.student === "a")
              .map((x) => ({ status: x.status }))
          : [],
      );
    },
  });
  const result = await store.studentHistory("a", {
    page: 1,
    submissionPage: 1,
    submissionStatus: "Rejected",
  });
  assert.equal(result.submissionStatusCounts.Rejected, 61);
  assert.equal(result.submissions.length, 11);
  const outage = createCloudStore({
    url: "https://test.invalid",
    key: "test",
    fetcher: async () => Response.json({ code: "42501" }, { status: 403 }),
  });
  await assert.rejects(
    outage.studentHistory("a", {
      page: 0,
      submissionPage: 0,
      submissionStatus: "",
    }),
    /ฐานข้อมูล/,
  );
});

test("HTTP full counts, independent pages, identity/media ownership and inactive accounts", async () => {
  const { createApp } = await import("../server/app.js");
  const { createStore } = await import("../server/store.js");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "wb-history-"));
  const store = createStore(dir, { demo: true });
  store.transact((s) => {
    const f = fixture();
    s.submissions = f.submissions.map((x) => ({
      ...x,
      student: x.student === "a" ? "65001" : "65003",
    }));
    s.ledger = f.ledger.map((x) => ({ ...x, student: "65001" }));
    s.redemptions = [];
  });
  const server = createApp({
    store,
    drive: {
      configured: false,
      connected: async () => false,
      download: async () =>
        new Response("image", { headers: { "content-type": "image/jpeg" } }),
    },
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const get = (path, cookie) =>
    fetch(base + path, { headers: cookie ? { cookie } : {} });
  try {
    assert.equal((await get("student?submissionStatus=Rejected")).status, 401);
    const login = await fetch(base + "identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "65001" }),
    });
    const cookie = login.headers
      .getSetCookie()
      .find(
        (x) => x.startsWith("eco_session=") && !x.startsWith("eco_session=;"),
      )
      .split(";")[0];
    const first = await (
      await get(
        "student?id=65003&submissionStatus=Rejected&submissionPage=0&page=1",
        cookie,
      )
    ).json();
    assert.equal(first.id, "65001");
    assert.equal(first.submissionStatusCounts.All, 244);
    assert.equal(first.submissionStatusCounts.Rejected, 61);
    assert.equal(first.submissions.length, 50);
    assert.equal(first.submissionsHasMore, true);
    assert.equal(first.ledger.length, 20);
    assert.equal(first.hasMore, false);
    assert.ok(
      first.submissions.every(
        (x) => x.student === "65001" && x.status === "Rejected",
      ),
    );
    assert.equal(JSON.stringify(first).includes("drive:"), false);
    assert.equal(first.pin, undefined);
    const second = await (
      await get(
        "student?submissionStatus=Rejected&submissionPage=1&page=0",
        cookie,
      )
    ).json();
    assert.equal(second.submissions.length, 11);
    assert.equal(second.submissionsHasMore, false);
    assert.equal(second.ledger.length, 50);
    assert.equal(second.hasMore, true);
    assert.equal(
      (await get("student?submissionStatus=unexpected", cookie)).status,
      400,
    );
    assert.equal((await get("media/submission/foreign", cookie)).status, 403);
    assert.equal((await get("media/submission/s002")).status, 401);
    assert.equal((await get("media/submission/s002", cookie)).status, 200);
    // Staff authentication is exercised with a real server-side session below;
    // avoids depending on fixture credential names/PINs.
    const { createHash } = await import("node:crypto");
    const token = "a".repeat(64);
    const staff = store
      .read({ staff: {} })
      .staff.find((x) => x.enabled !== false);
    await store.control("put", {
      id: "session:" + createHash("sha256").update(token).digest("hex"),
      value: {
        role: "staff",
        id: staff.id,
        authVersion: staff.authVersion || 0,
        expires: Date.now() + 60000,
        absolute: Date.now() + 60000,
      },
    });
    assert.equal(
      (await get("media/submission/foreign", "eco_session=" + token)).status,
      200,
    );
    store.transact((s) => {
      s.students.find((x) => x.id === "65001").status = "Inactive";
    });
    assert.equal((await get("student", cookie)).status, 401);
    assert.equal((await get("media/submission/s002", cookie)).status, 401);
  } finally {
    await new Promise((r) => server.close(r));
    store.close?.();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("legacy history retries a concurrent review and rejects persistent churn", async () => {
  for (const persistent of [false, true]) {
    const s = fixture();
    let version = 1,
      summaries = 0,
      pageReads = 0;
    const store = createCloudStore({
      url: "https://test.invalid",
      key: "test",
      fetcher: async (url, options) => {
        if (url.endsWith("/rpc/wb_student_history"))
          return Response.json({ code: "PGRST202" }, { status: 404 });
        if (url.endsWith("/rpc/wb_summary")) {
          summaries++;
          return Response.json({
            students: s.students.map((x) => ({ ...x, balance: 0, earned: 0 })),
          });
        }
        if (url.endsWith("/rpc/wb_snapshot")) {
          const scope = JSON.parse(options.body).scope;
          if (scope.submissions) {
            pageReads++;
            if (persistent || pageReads === 1) {
              s.submissions.find(
                (x) => x.student === "a" && x.status === "Rejected",
              ).status = "Approved";
              version++;
            }
          }
          return Response.json({ version, value: selectState(s, scope) });
        }
        const params = new URL(url).searchParams;
        assert.equal(params.get("select"), "status");
        return Response.json(
          params.get("offset") === "0"
            ? s.submissions
                .filter((x) => x.student === "a")
                .map((x) => ({ status: x.status }))
            : [],
        );
      },
    });
    const options = {
      page: 0,
      submissionPage: 1,
      submissionStatus: "Rejected",
    };
    if (persistent) {
      await assert.rejects(
        store.studentHistory("a", options),
        (error) => error.status === 409 && error.code === "HISTORY_CHANGED",
      );
      assert.equal(summaries, 3);
      assert.equal(pageReads, 3);
    } else {
      const result = await store.studentHistory("a", options);
      assert.equal(summaries, 2);
      assert.equal(pageReads, 2);
      assert.equal(result.submissionStatusCounts.Rejected, 60);
      assert.equal(result.submissionStatusCounts.Approved, 62);
      assert.equal(result.submissions.length, 10);
      assert.ok(result.submissions.every((x) => x.status === "Rejected"));
    }
  }
});
