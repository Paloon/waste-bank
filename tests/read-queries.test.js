import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTestDatabase } from "./pglite.mjs";
import { emptyState, selectState, records } from "../server/state.js";
import { createCloudStore } from "../server/cloud-store.js";
import {
  adminRead,
  publicOverview,
  rankSearch,
  leaderboard,
} from "../server/read-queries.js";
import { studentHistory } from "../server/views.js";

function fixture() {
  const s = emptyState();
  for (let i = 0; i < 135; i++) {
    const id = String(65000 + i);
    s.students.push({
      id,
      name: "Name" + i + " Family",
      grade: String((i % 3) + 1),
      room: String((i % 2) + 1),
      status: i % 15 === 0 ? "Inactive" : "Active",
      pin: "must-not-transfer",
      photo: "data:large-private-student-photo",
    });
    s.ledger.push({
      id: "l" + i,
      student: id,
      amount: i,
      type: "recycle",
      at: "2026-10-14T01:00:00Z",
    });
    s.submissions.push({
      id: "s" + i,
      student: id,
      status: "Pending",
      category: "plastic",
      image: "drive:secret" + i,
      at: "2026-10-14T01:00:00Z",
    });
    s.redemptions.push({
      id: "r" + i,
      student: id,
      status: "Pending Pickup",
      code: "code" + i,
      at: "2026-10-14T01:00:00Z",
    });
    s.audit.push({
      id: "a" + i,
      actorRole: "student",
      actorId: id,
      target: id,
      at: "2026-10-14T01:00:00Z",
      action: "login",
    });
  }
  s.rewards = [
    { id: "reward", name: "Prize", enabled: true, price: 1, stock: 10 },
    {
      id: "legacy-reward",
      name: "Legacy prize",
      enabled: true,
      price: 1,
      stock: 10,
      deletedAt: null,
    },
  ];
  s.staff = [{ id: "teacher", name: "Teacher", enabled: true }];
  return s;
}
const signatures = {
  wb_snapshot: ["scope"],
  wb_control: ["op", "args"],
  wb_student_history: [
    "student_id",
    "wallet_page",
    "submission_page",
    "submission_status",
    "page_size",
  ],
  wb_admin_read: ["selected_tab", "page_number", "search_query", "page_size"],
  wb_rank_search: [
    "search_query",
    "selected_grade",
    "selected_room",
    "monthly",
  ],
  wb_leaderboard: ["selected_grade", "selected_room", "monthly"],
  wb_public_overview: [],
  wb_summary: [],
};
function cloudStore(db, calls) {
  return createCloudStore({
    url: "https://test.invalid",
    key: "test",
    fetcher: async (url, options) => {
      const fn = url.split("/").at(-1),
        args = JSON.parse(options.body);
      calls.push({ fn, args });
      const keys = signatures[fn];
      assert.ok(keys, "Unexpected API " + fn);
      const result = await db.query(
        `select ${fn}(${keys.map((_, i) => "$" + (i + 1)).join(",")}) result`,
        keys.map((k) => args[k]),
      );
      return Response.json(result.rows[0].result);
    },
  });
}
test("bounded read RPCs retain SQL/local totals, search, rank and related-student parity without summaries", async () => {
  const db = await createTestDatabase(),
    s = fixture(),
    calls = [];
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;",
    );
    await db.exec(
      readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
    );
    await db.query("select wb_initialize($1)", [records(s)]);
    await db.exec(
      readFileSync(
        new URL("../supabase/read-queries.sql", import.meta.url),
        "utf8",
      ),
    );
    const cloud = cloudStore(db, calls),
      local = { read: async (scope) => selectState(s, scope) };
    for (const tab of [
      "students",
      "reviews",
      "pickups",
      "ledger",
      "audit",
      "dashboard",
      "rewards",
    ])
      for (const page of [0, 1, 99]) {
        const opts = { tab, page, query: "" },
          a = await adminRead(local, opts),
          b = await adminRead(cloud, opts);
        assert.deepEqual(
          b.students.map((p) => ({ id: p.id, balance: p.balance })),
          a.students.map((p) => ({ id: p.id, balance: p.balance })),
          tab,
        );
        assert.equal(b.hasMore, a.hasMore, tab);
        for (const kind of ["submissions", "redemptions", "ledger", "audit"])
          assert.deepEqual(b[kind], a[kind], tab);
        assert.deepEqual(b.stats, a.stats);
        assert.ok(b.students.length <= 50);
        assert.ok(JSON.stringify(b.students).indexOf("must-not-transfer") < 0);
        assert.ok(JSON.stringify(b.students).indexOf("large-private") < 0);
      }
    for (const opts of [
      { tab: "students", page: 0, query: "Name12" },
      { tab: "students", page: 0, query: "ม.2/1" },
      { tab: "pickups", page: 0, query: "Name12" },
    ]) {
      const a = await adminRead(local, opts),
        b = await adminRead(cloud, opts);
      assert.deepEqual(
        b.students.map((x) => x.id),
        a.students.map((x) => x.id),
      );
      assert.deepEqual(b.redemptions, a.redemptions);
    }
    const pub = await publicOverview(cloud),
      pubLocal = await publicOverview(local);
    assert.equal(pub.students.length, 3);
    assert.equal(pub.rewards.length, 2);
    assert.deepEqual(
      pub.students.map((p) => p.id),
      pubLocal.students.map((p) => p.id),
    );
    assert.deepEqual(pub.stats, pubLocal.stats);
    for (const opts of [
      { grade: "", room: "", monthly: false },
      { grade: "2", room: "1", monthly: true },
    ])
      assert.deepEqual(
        await leaderboard(cloud, opts),
        await leaderboard(local, opts),
      );
    for (const opts of [
      { query: "Name", grade: "", room: "", monthly: false },
      { query: "Name12", grade: "2", room: "1", monthly: true },
      { query: "", grade: "", room: "", monthly: false },
    ])
      assert.deepEqual(
        await rankSearch(cloud, opts),
        await rankSearch(local, opts),
      );
    const history = await studentHistory(cloud, "65134", {
      page: 0,
      submissionPage: 0,
      submissionStatus: "",
    });
    assert.equal(history.student.balance, 134);
    assert.equal(history.rank, 1);
    assert.equal(history.student.pin, undefined);
    assert.ok(calls.every((x) => x.fn !== "wb_summary"));
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      for (const sql of [
        "select wb_admin_read('students',0,'',50)",
        "select wb_public_overview()",
        "select wb_rank_search('Name','','',false)",
        "select wb_leaderboard('','',false)",
        "select * from wb_student_scores(array['65134'])",
        "select wb_metrics()",
      ])
        await assert.rejects(db.query(sql), /permission denied/);
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});

test("HTTP tailored admin/public queries preserve authorization and bound sensitive payloads", async () => {
  const { createApp } = await import("../server/app.js");
  const { createHash } = await import("node:crypto");
  const db = await createTestDatabase(),
    calls = [];
  let server;
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;",
    );
    await db.exec(
      readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
    );
    await db.query("select wb_initialize($1)", [records(fixture())]);
    const store = cloudStore(db, calls),
      token = "b".repeat(64);
    await store.control("put", {
      id: "session:" + createHash("sha256").update(token).digest("hex"),
      value: {
        role: "staff",
        id: "teacher",
        authVersion: 0,
        absolute: Date.now() + 60000,
        expires: Date.now() + 60000,
      },
    });
    server = createApp({
      store,
      drive: { configured: false, connected: async () => false },
    }).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${server.address().port}/api/`;
    const get = (path, staff = false) =>
      fetch(base + path, {
        headers: staff ? { cookie: "eco_session=" + token } : {},
      });
    assert.equal((await get("admin?tab=students")).status, 401);
    const students = await (
      await get("admin?tab=students&page=1", true)
    ).json();
    assert.equal(students.students.length, 50);
    assert.equal(students.hasMore, true);
    assert.deepEqual(
      students.students.map((x) => x.id),
      Array.from({ length: 50 }, (_, i) => String(65050 + i)),
    );
    assert.equal(JSON.stringify(students).includes("must-not-transfer"), false);
    assert.equal(JSON.stringify(students).includes("large-private"), false);
    const reviews = await (await get("admin?tab=reviews&page=1", true)).json();
    assert.equal(reviews.submissions.length, 50);
    assert.equal(reviews.students.length, 50);
    const related = new Set(reviews.submissions.map((x) => x.student));
    assert.ok(reviews.students.every((x) => related.has(x.id)));
    assert.ok(
      reviews.submissions.every((x) =>
        x.image.startsWith("/api/media/submission/"),
      ),
    );
    assert.equal(JSON.stringify(reviews).includes("drive:"), false);
    const search = await (
      await get("admin?tab=students&q=Name134", true)
    ).json();
    assert.deepEqual(
      search.students.map((x) => x.id),
      ["65134"],
    );
    assert.equal(search.hasMore, false);
    assert.equal((await get("admin?tab=wrong", true)).status, 400);
    const publicData = await (await get("public")).json();
    assert.equal(publicData.leaderboard.length, 3);
    assert.equal(publicData.students, undefined);
    assert.equal(
      JSON.stringify(publicData).includes("must-not-transfer"),
      false,
    );
    const leaders = await (
      await get("leaderboard?grade=2&room=1&period=month")
    ).json();
    assert.ok(leaders.length <= 10);
    assert.ok(leaders.every((x) => x.grade === "2" && x.room === "1"));
    const ranks = await (await get("rank?q=Name")).json();
    assert.equal(ranks.length, 50);
    assert.equal(ranks[0].rank, 1);
    assert.ok(calls.every((x) => x.fn !== "wb_summary"));
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
    await db.close();
  }
});

test("missing tailored RPC uses bounded compatibility data; database permission failures do not fall back", async () => {
  const s = fixture();
  let summaries = 0;
  const store = createCloudStore({
    url: "https://test.invalid",
    key: "test",
    fetcher: async (url, options) => {
      if (url.endsWith("/rpc/wb_admin_read"))
        return Response.json({ code: "PGRST202" }, { status: 404 });
      if (url.endsWith("/rpc/wb_snapshot"))
        return Response.json({
          version: 1,
          value: selectState(s, JSON.parse(options.body).scope),
        });
      if (url.endsWith("/rpc/wb_summary")) {
        summaries++;
        const { summary } = await import("../server/views.js");
        return Response.json(await summary({ read: async () => s }));
      }
      throw new Error("unexpected fallback path");
    },
  });
  const data = await adminRead(store, { tab: "students", page: 2, query: "" });
  assert.equal(data.students.length, 35);
  assert.equal(data.hasMore, false);
  assert.equal(summaries, 1);
  const denied = createCloudStore({
    url: "https://test.invalid",
    key: "test",
    fetcher: async () => Response.json({ code: "42501" }, { status: 403 }),
  });
  await assert.rejects(
    adminRead(denied, { tab: "students", page: 0, query: "" }),
    /ฐานข้อมูล/,
  );
});
