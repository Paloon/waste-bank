import { runtime } from "./runtime.mjs";
import { backup } from "../server/backup.js";
import { report } from "../server/monitor.js";
const { store, drive } = runtime();
try {
  console.log(
    await backup(
      store,
      drive,
      process.env.BACKUP_DIR || ".backups",
      process.env.BACKUP_KEY,
      { keepDays: Number(process.env.BACKUP_KEEP_DAYS) || 7 },
    ),
  );
} catch (error) {
  await report(store, "BACKUP_FAILED");
  throw error;
} finally {
  store.close?.();
}
