import { runtime } from "./runtime.mjs";
import { readOperationsHealth } from "../server/operations-health.js";

// Read-only: this never runs cleanup, uploads files or changes student records.
const { store } = runtime();
try {
  const health = await readOperationsHealth(store);
  console.log(JSON.stringify(health.status, null, 2));
  if (!health.status.ok) process.exitCode = 1;
} finally {
  store.close?.();
}
