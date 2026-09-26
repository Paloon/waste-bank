import { runtime } from "./runtime.mjs";
import { maintenance } from "../server/maintenance.js";
import { summary } from "../server/views.js";
const { store, drive } = runtime();
try {
  await drive.verifyFolders();
  const s = await summary(store),
    negative = s.students.filter((x) => x.balance < 0).length;
  if (negative || s.rewards.some((x) => x.stock < 0))
    throw Error("Ledger/stock reconciliation failed");
  const result = await maintenance(store, drive);
  console.log(
    JSON.stringify({
      students: s.students.length,
      negativeBalances: negative,
      maintenance: result,
    }),
  );
  if (result.failures || result.overdue) process.exitCode = 1;
} finally {
  store.close?.();
}
