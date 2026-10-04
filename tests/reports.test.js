import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  reportRange,
  selectReportSource,
  buildReport,
} from "../server/reports.js";
import { createCloudStore } from "../server/cloud-store.js";
import { createStore } from "../server/store.js";
import { createApp } from "../server/app.js";

const range = reportRange("2026-10-04", "2026-10-04");
const fixture = () => ({
  students: [
    { id: "65001", name: "หนึ่ง", grade: "1", room: "1", pin: "private" },
    { id: "65002", name: "สอง", grade: "2", room: "2" },
  ],
  submissions: [
    {
      id: "s1",
      student: "65001",
      at: "2026-10-03T16:59:59Z",
      status: "Approved",
      category: "กระดาษ",
      reviewedAt: "2026-10-04T08:00:00Z",
      weight: 2,
      coins: 100,
      image: "private-photo",
    },
    {
      id: "s2",
      student: "65001",
      at: "2026-10-03T17:00:00Z",
      status: "Pending",
      category: "แก้ว",
    },
    {
      id: "s3",
      student: "65001",
      at: "2026-10-04T16:59:59Z",
      status: "Approved",
      category: "แก้ว",
      reviewedAt: "2026-10-05T08:00:00Z",
      weight: 3,
      coins: 200,
    },
    {
      id: "s4",
      student: "65002",
      at: "2026-10-04T17:00:00Z",
      status: "Pending",
      category: "แก้ว",
    },
    {
      id: "s5",
      student: "65002",
      at: "2026-10-04T08:00:00Z",
      status: "Approved",
      category: "แก้ว",
      weight: 9,
    },
  ],
  redemptions: [
    {
      id: "r-old",
      student: "65001",
      at: "2026-09-01T00:00:00Z",
      status: "Cancelled",
      reward: "gift",
      name: "สมุด",
      cost: 150,
    },
    {
      id: "r-picked",
      student: "65002",
      at: "2026-09-02T00:00:00Z",
      status: "Completed",
      reward: "gift",
      name: "สมุด",
      cost: 150,
      completedAt: "2026-10-04T08:00:00Z",
    },
    {
      id: "r-new",
      student: "65001",
      at: "2026-10-04T08:00:00Z",
      status: "Pending Pickup",
      reward: "gift",
      name: "สมุด",
      cost: 50,
    },
  ],
  ledger: [
    {
      id: "l1",
      student: "65001",
      at: "2026-10-04T08:00:00Z",
      type: "recycle",
      amount: 100,
      related: "s1",
    },
    {
      id: "l2",
      student: "65001",
      at: "2026-10-04T08:01:00Z",
      type: "redemption",
      amount: -50,
      related: "r-new",
    },
    {
      id: "l3",
      student: "65001",
      at: "2026-10-04T08:02:00Z",
      type: "refund",
      amount: 150,
      related: "r-old",
    },
    {
      id: "l4",
      student: "65001",
      at: "2026-10-04T08:03:00Z",
      type: "adjustment",
      amount: 20,
    },
    {
      id: "l5",
      student: "65001",
      at: "2026-10-04T08:04:00Z",
      type: "adjustment",
      amount: -3,
    },
    {
      id: "l6",
      student: "65001",
      at: "2026-10-04T08:05:00Z",
      type: "opening",
      amount: 30,
    },
    {
      id: "l7",
      student: "65001",
      at: "2026-10-04T17:00:00Z",
      type: "recycle",
      amount: 999,
    },
  ],
  audit: [
    {
      id: "a1",
      staff: "นักเรียน 65001",
      at: "2026-10-04T08:00:00Z",
      action: "login",
      target: "student",
      after: { secret: "private" },
    },
    {
      id: "a2",
      staff: "นักเรียน 65001",
      at: "2026-10-04T09:00:00Z",
      action: "register",
    },
    {
      id: "a3",
      staff: "teacher",
      at: "2026-10-04T10:00:00Z",
      action: "login",
      target: "staff",
    },
    {
      id: "a4",
      staff: "นักเรียน 65002",
      at: "2026-10-04T17:00:00Z",
      action: "login",
    },
  ],
});
test("reports use Bangkok boundaries and each event's date, unique people and separate refunds", () => {
  const source = selectReportSource(fixture(), range),
    r = buildReport(source, range);
  assert.equal(r.totals.submitted, 3);
  assert.equal(r.totals.submitters, 2);
  assert.equal(r.totals.approved, 1);
  assert.equal(r.totals.weight, 2);
  assert.equal(r.totals.issued, 100);
  assert.equal(r.totals.spent, 50);
  assert.equal(r.totals.refunded, 150);
  assert.equal(r.totals.adjustmentPlus, 20);
  assert.equal(r.totals.adjustmentMinus, 3);
  assert.equal(r.totals.opening, 30);
  assert.equal(r.totals.logins, 2);
  assert.equal(r.totals.visitors, 1);
  assert.equal(r.totals.redeemed, 1);
  assert.equal(r.totals.completed, 1);
  assert.equal(r.totals.rewardCancelled, 1);
  assert.equal(r.coverage.unknownReviewDates, 1);
  assert.equal(r.rewards[0].pending, 1);
  assert.equal(r.categories.find((c) => c.category === "กระดาษ").coins, 100);
  assert.equal(r.daily[0].submitters, 2);
  assert.equal(JSON.stringify(source).includes("private"), false);
  const coins = buildReport(source, range, { group: "coins" });
  assert.equal(coins.rows.length, 6);
  assert.equal(coins.rows[0].kind, "opening");
});
test("report totals are independent of pagination and daily people show only that day's activity", () => {
  const f = fixture();
  for (let i = 0; i < 55; i++)
    f.ledger.push({
      id: "x" + i,
      student: "65001",
      type: "adjustment",
      amount: 1,
      at: "2026-10-04T10:00:00Z",
    });
  const source = selectReportSource(f, range),
    a = buildReport(source, range, { group: "coins" }),
    b = buildReport(source, range, { group: "coins", page: 1 });
  assert.deepEqual(a.totals, b.totals);
  assert.equal(a.rows.length, 50);
  assert.equal(b.rows.length, 11);
  const both = reportRange("2026-10-04", "2026-10-05");
  const people = buildReport(selectReportSource(f, both), both, {
    group: "students",
    day: "2026-10-05",
  });
  assert.equal(people.rows.find((p) => p.id === "65001").weight, 3);
  assert.equal(people.rows.find((p) => p.id === "65001").adjustmentPlus, 0);
});
test("reports reject invalid dates and excessive periods rather than silently returning partial totals", () => {
  for (const pair of [
    ["2026-02-30", "2026-03-01"],
    ["2026-10-05", "2026-10-04"],
    ["2025-01-01", "2026-10-04"],
    ["bad", "bad"],
  ])
    assert.throws(() => reportRange(...pair));
  assert.throws(() =>
    buildReport(selectReportSource(fixture(), range), range, { group: "bad" }),
  );
  assert.throws(() =>
    buildReport(selectReportSource(fixture(), range), range, {
      day: "2026-10-06",
    }),
  );
});
test("cloud report reads project only safe fields, paginate through server caps, and retry changing versions", async () => {
  const urls = [];
  let snapshots = 0;
  const f = fixture();
  const fetcher = async (url, options) => {
    if (url.endsWith("rpc/wb_snapshot")) {
      assert.deepEqual(JSON.parse(options.body).scope, {});
      snapshots++;
      return Response.json({ version: snapshots === 1 ? 1 : 2, value: {} });
    }
    const p = new URL(url).searchParams;
    urls.push(p);
    const kind = p.get("kind").slice(3),
      offset = Number(p.get("offset"));
    assert.ok(p.get("select").includes("id:data->id"));
    assert.equal(p.get("select").includes("image"), false);
    assert.equal(p.get("select").includes("pin"), false);
    // Simulate a database max_rows setting below the requested page size.
    return Response.json(f[kind].slice(offset, offset + 2));
  };
  const cloud = createCloudStore({
    url: "https://example.invalid",
    key: "test",
    fetcher,
  });
  const source = await cloud.reportSource(range);
  assert.equal(source.ledger.length, f.ledger.length);
  assert.equal(snapshots, 4);
  assert.ok(
    urls.some(
      (p) =>
        p.get("kind") === "eq.submissions" &&
        p.get("or").includes("data->>reviewedAt"),
    ),
  );
  assert.ok(urls.some((p) => p.get("offset") === "2"));
});
test("report API is staff-only and rejects invalid ranges", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-report-")),
    store = createStore(dir, { demo: true });
  const server = createApp({
    store,
    drive: { configured: false, connected: async () => false },
  }).listen(0, "127.0.0.1");
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
  const cookie = (response) =>
    response.headers
      .getSetCookie()
      .find(
        (x) => x.startsWith("eco_session=") && !x.startsWith("eco_session=;"),
      )
      .split(";")[0];
  try {
    assert.equal(
      (await call("reports?from=2026-10-04&to=2026-10-04")).status,
      401,
    );
    const student = cookie(await call("identify", { id: "65001" }));
    assert.equal(
      (await call("reports?from=2026-10-04&to=2026-10-04", null, student))
        .status,
      403,
    );
    const pin = readFileSync(join(dir, "demo-credentials.txt"), "utf8").match(
      /PIN: (\d+)/,
    )[1];
    const staff = cookie(await call("login", { id: "teacher.mali", pin }));
    assert.equal(
      (await call("reports?from=bad&to=bad", null, staff)).status,
      400,
    );
    const response = await call(
      "reports?from=2026-10-04&to=2026-10-04",
      null,
      staff,
    );
    assert.equal(response.status, 200);
    const r = await response.json();
    assert.equal(r.range.from, "2026-10-04");
    assert.ok(r.coverage.loginHistoryOnly);
    assert.equal(JSON.stringify(r).includes(pin), false);
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
