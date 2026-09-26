// Local synthetic data only. Never sends traffic to the deployed school.
import { performance } from "node:perf_hooks";
import { emptyState, totals } from "../server/state.js";
const students = Number(process.env.LOAD_STUDENTS) || 3000,
  entries = Number(process.env.LOAD_ENTRIES) || 100000;
const state = emptyState(),
  at = new Date().toISOString();
state.students = Array.from({ length: students }, (_, i) => ({
  id: String(i),
}));
state.ledger = Array.from({ length: entries }, (_, i) => ({
  student: String(i % students),
  amount: 1,
  type: "recycle",
  at,
}));
const started = performance.now(),
  result = totals(state),
  elapsedMs = Math.round(performance.now() - started);
if ([...result.values()].reduce((n, x) => n + x.balance, 0) !== entries)
  throw Error("Aggregation mismatch");
console.log(
  JSON.stringify({
    students,
    entries,
    elapsedMs,
    heapMiB: Math.ceil(process.memoryUsage().heapUsed / 1024 / 1024),
  }),
);
