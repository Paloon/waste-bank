// Deterministic local SQLite fixtures only. No HTTP, credentials or live stores.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { createStore } from "../server/store.js";
import { emptyState } from "../server/state.js";
import { summary, studentHistory } from "../server/views.js";
import { policy } from "../shared/policy.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const repetitions = Number(option("--samples", "3"));
assert.ok(
  Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 20,
);
const fixedNow = Date.parse("2026-10-14T08:00:00.000Z");
const realNow = Date.now;
const ordered = (rows) =>
  [...rows].sort(
    (a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id),
  );
const payloadBytes = (value) => Buffer.byteLength(JSON.stringify(value));
const timings = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samplesMs: values.map((value) => Number(value.toFixed(2))),
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
    p95Ms: Number(
      sorted[
        Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
      ].toFixed(2),
    ),
  };
};
function fixture(students, entries) {
  const s = emptyState();
  s.students = Array.from({ length: students }, (_, i) => ({
    id: String(50000 + i),
    name: `Synthetic Student ${i}`,
    status: "Active",
    grade: String(Math.floor(i / 1800) + 1),
    room: String(Math.floor((i % 1800) / 60) + 1),
    number: (i % 60) + 1,
  }));
  s.rewards = [
    {
      id: "synthetic-reward",
      name: "Synthetic reward",
      stock: entries,
      price: 1,
      enabled: true,
    },
  ];
  const balances = new Map(s.students.map((student) => [student.id, 0]));
  const at = (i) => new Date(fixedNow - (i % 60) * 86400000).toISOString();
  s.ledger = Array.from({ length: entries }, (_, i) => {
    const student = s.students[i % students].id,
      amount = (i % 3) + 1;
    balances.set(student, balances.get(student) + amount);
    return {
      id: `ledger-${String(i).padStart(8, "0")}`,
      student,
      amount,
      type: "recycle",
      reason: "Synthetic recycling",
      at: at(i),
    };
  });
  const statuses = ["Approved", "Pending", "Rejected", "Cancelled"];
  s.submissions = Array.from({ length: Math.floor(entries / 5) }, (_, i) => ({
    id: `submission-${String(i).padStart(8, "0")}`,
    student: s.students[(i * 7) % students].id,
    status: statuses[i % 4],
    category: "Synthetic category",
    count: 1,
    coins: 1,
    note: `synthetic note ${i % 10}`,
    image: "data:image/png;base64,c3ludGhldGlj",
    disposalImage: "",
    at: at(i),
    reviewedAt: at(i),
  }));
  s.redemptions = Array.from({ length: Math.floor(entries / 20) }, (_, i) => ({
    id: `redemption-${String(i).padStart(8, "0")}`,
    student: s.students[i % students].id,
    reward: "synthetic-reward",
    status: "Completed",
    cost: 1,
    at: at(i),
  }));
  return { s, balances };
}
const results = [];
const sources = Object.fromEntries(
  await Promise.all(
    [
      "server/store.js",
      "server/views.js",
      "server/state.js",
      "scripts/benchmark-performance.mjs",
    ].map(async (file) => [
      file,
      createHash("sha256")
        .update(await readFile(join(root, file)))
        .digest("hex"),
    ]),
  ),
);
Date.now = () => fixedNow;
try {
  for (const [students, entries] of [
    [300, 10000],
    [1500, 50000],
    [3000, 100000],
  ]) {
    const { s, balances } = fixture(students, entries);
    const directory = await mkdtemp(join(tmpdir(), "wb-synthetic-benchmark-"));
    let store;
    try {
      store = createStore(directory, { demo: false });
      store.transact((state) => Object.assign(state, s));
      const originalRead = store.read.bind(store);
      let reads = [];
      store.read = (scope) => {
        const value = originalRead(scope);
        reads.push({ scope: scope || null, value });
        return value;
      };
      const id = s.students[0].id;
      const own = (kind) =>
        ordered(s[kind].filter((row) => row.student === id));
      const checkHistory = (value, page, status) => {
        assert.equal(value.student.id, id);
        assert.equal(value.student.balance, balances.get(id));
        assert.deepEqual(
          value.ledger.map((row) => row.id),
          own("ledger")
            .slice(
              page * policy.pageSize,
              page * policy.pageSize + policy.pageSize + 1,
            )
            .map((row) => row.id),
        );
        const submissions = own("submissions");
        const filtered = submissions.filter(
          (row) => !status || row.status === status,
        );
        assert.deepEqual(
          value.submissions.map((row) => row.id),
          filtered
            .slice(
              page * policy.pageSize,
              page * policy.pageSize + policy.pageSize + 1,
            )
            .map((row) => row.id),
        );
        assert.equal(value.submissionStatusCounts.All, submissions.length);
        for (const category of ["Approved", "Pending", "Rejected", "Cancelled"])
          assert.equal(
            value.submissionStatusCounts[category],
            submissions.filter((row) => row.status === category).length,
          );
        const rank =
          [...balances]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .findIndex(([student]) => student === id) + 1;
        assert.equal(value.rank, rank);
      };
      const queryExpected = ordered(
        s.submissions.filter((row) =>
          JSON.stringify(row).toLowerCase().includes("synthetic note 3"),
        ),
      ).slice(policy.pageSize, policy.pageSize * 2 + 1);
      const workloads = [
        [
          "summary",
          () => summary(store),
          (value) => {
            assert.equal(value.students.length, students);
            for (const student of value.students)
              assert.equal(student.balance, balances.get(student.id));
            assert.equal(
              value.stats.coins,
              [...balances.values()].reduce((a, b) => a + b, 0),
            );
          },
        ],
        [
          "student-history-first",
          () =>
            studentHistory(store, id, {
              page: 0,
              submissionPage: 0,
              submissionStatus: "",
            }),
          (value) => checkHistory(value, 0, ""),
        ],
        [
          "student-history-filtered-page-2",
          () =>
            studentHistory(store, id, {
              page: 1,
              submissionPage: 1,
              submissionStatus: "Approved",
            }),
          (value) => checkHistory(value, 1, "Approved"),
        ],
        [
          "submission-query-page-2",
          () =>
            store.read({
              submissions: {
                query: "synthetic note 3",
                limit: policy.pageSize + 1,
                offset: policy.pageSize,
              },
            }),
          (value) => {
            assert.deepEqual(
              value.submissions.map((row) => row.id),
              queryExpected.map((row) => row.id),
            );
          },
        ],
      ];
      const measurements = {};
      for (const [name, run, check] of workloads) {
        check(await run()); // Untimed warmup and independent output oracle.
        const elapsed = [];
        let value;
        for (let repeat = 0; repeat < repetitions; repeat++) {
          reads = [];
          const started = performance.now();
          value = await run();
          elapsed.push(performance.now() - started);
          check(value);
        }
        measurements[name] = {
          ...timings(elapsed),
          responseBytes: payloadBytes(value),
          snapshotReads: reads.length,
          recordsReturnedByReads: reads.reduce(
            (total, read) =>
              total +
              Object.values(read.value)
                .filter(Array.isArray)
                .reduce((count, rows) => count + rows.length, 0),
            0,
          ),
          bytesReturnedByReads: reads.reduce(
            (total, read) => total + payloadBytes(read.value),
            0,
          ),
          correctness: "passed",
        };
        reads = [];
      }
      results.push({
        students,
        ledgerEntries: entries,
        submissions: s.submissions.length,
        redemptions: s.redemptions.length,
        serializedFixtureBytes: payloadBytes(s),
        workloads: measurements,
      });
    } finally {
      store?.close();
      const target = resolve(directory),
        base = resolve(tmpdir()) + sep;
      assert.ok(
        target.startsWith(base) &&
          target.split(sep).at(-1).startsWith("wb-synthetic-benchmark-"),
      );
      await rm(target, { recursive: true, force: true });
    }
  }
} finally {
  Date.now = realNow;
}
const report = {
  label: option("--label", "current"),
  generatedAt: new Date().toISOString(),
  fixtureClock: new Date(fixedNow).toISOString(),
  node: process.versions.node,
  platform: process.platform,
  repetitions,
  sources,
  limitations: [
    "Local synthetic SQLite only; no production/cloud network traffic",
    "SQLite stores a complete JSON snapshot; scoped reads still parse the complete snapshot",
    "Response/returned-read bytes describe logical payloads, not database transport or disk reads",
    "Single process, warmup plus repeated sequential reads; p95 is descriptive with few samples",
  ],
  results,
};
const output = option("--output", "");
if (output) {
  const target = resolve(root, output);
  assert.ok(
    target.startsWith(resolve(root, "docs") + sep),
    "Benchmark output must stay within repository docs",
  );
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `Synthetic benchmark ${report.label} passed all correctness checks; report: ${target}`,
  );
} else console.log(JSON.stringify(report, null, 2));
