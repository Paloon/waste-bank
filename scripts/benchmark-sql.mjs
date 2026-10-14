// Isolated PostgreSQL/WASM only. No credentials, network or live student records.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createTestDatabase } from "../tests/pglite.mjs";

const db = await createTestDatabase();
const result = {
  engine: "PGlite PostgreSQL in WASM",
  samples: 5,
  limitations: [
    "Local warm sequential reads; timings exclude HTTP, Vercel cold starts and Supabase network.",
    "RPC bytes are database responses, not equivalent endpoint responses.",
    "Five samples describe these runs and cannot establish a production p95 SLA.",
  ],
  levels: [],
};
try {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  await db.exec(
    await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
  );
  for (const [people, entries] of [
    [300, 10000],
    [1500, 50000],
    [3000, 100000],
  ]) {
    await db.exec("truncate waste_bank_records;");
    const rows = Array.from({ length: people }, (_, i) => ({
      kind: "students",
      id: String(50000 + i),
      data: {
        id: String(50000 + i),
        name: `Synthetic ${i} Student`,
        grade: String((i % 6) + 1),
        room: "1",
        number: (i % 60) + 1,
        status: "Active",
      },
    }));
    const at = new Date().toISOString();
    for (let i = 0; i < entries; i++)
      rows.push({
        kind: "ledger",
        id: `ledger-${i}`,
        data: {
          id: `ledger-${i}`,
          student: String(50000 + (i % people)),
          amount: 1,
          type: "recycle",
          at,
        },
      });
    for (let i = 0; i < entries / 5; i++)
      rows.push({
        kind: "submissions",
        id: `submission-${i}`,
        data: {
          id: `submission-${i}`,
          student: String(50000 + (i % people)),
          category: "plastic",
          count: 1,
          status: "Pending",
          at,
        },
      });
    for (let offset = 0; offset < rows.length; offset += 5000) {
      await db.query(
        "insert into waste_bank_records(kind,id,data) select kind,id,data from jsonb_to_recordset($1::jsonb) as r(kind text,id text,data jsonb)",
        [JSON.stringify(rows.slice(offset, offset + 5000))],
      );
    }
    await db.exec("analyze waste_bank_records;");
    const workloads = {};
    for (const [name, sql] of Object.entries({
      previousSummary: "select wb_summary() result",
      studentsPage: "select wb_admin_read('students',0,'',50) result",
      reviewPage: "select wb_admin_read('reviews',0,'',50) result",
      publicOverview: "select wb_public_overview() result",
      studentHistory: "select wb_student_history('50000',0,0,'',50) result",
    })) {
      await db.query(sql);
      const samples = [];
      let value;
      for (let i = 0; i < 5; i++) {
        const started = performance.now();
        value = (await db.query(sql)).rows[0].result;
        samples.push(Number((performance.now() - started).toFixed(2)));
      }
      if (value.stats) assert.equal(value.stats.coins, entries);
      if (name === "previousSummary")
        assert.equal(value.students.length, people);
      if (name === "studentsPage") assert.equal(value.students.length, 50);
      if (name === "reviewPage") {
        assert.equal(value.submissions.length, 50);
        assert.equal(
          value.students.length,
          new Set(value.submissions.map((item) => item.student)).size,
        );
      }
      if (name === "publicOverview") assert.equal(value.students.length, 3);
      if (name === "studentHistory")
        assert.equal(value.student.balance, Math.ceil(entries / people));
      const sorted = [...samples].sort((a, b) => a - b);
      workloads[name] = {
        samplesMs: samples,
        medianMs: sorted[2],
        observedP95Ms: sorted[4],
        databaseResponseBytes: Buffer.byteLength(JSON.stringify(value)),
        correctness: "passed",
      };
    }
    const plan = await db.query(
      "explain (analyze, buffers, format json) select data from waste_bank_records where kind='ledger' and student='50000' order by at desc,id limit 51",
    );
    result.levels.push({
      students: people,
      ledger: entries,
      workloads,
      historyQueryPlan: plan.rows[0]["QUERY PLAN"],
    });
    console.log(
      JSON.stringify({
        students: people,
        ledger: entries,
        correctness: "passed",
        workloads,
      }),
    );
  }
  await writeFile(
    new URL("../docs/performance-sql.json", import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
} finally {
  await db.close();
}
