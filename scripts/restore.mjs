import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { createStore } from "../server/store.js";
import { readBackup, restoreLocal } from "../server/backup.js";
const [file, target] = process.argv.slice(2);
if (!file || !target)
  throw Error("Usage: npm run restore -- SNAPSHOT.wb NEW_DIRECTORY");
const directory = resolve(target);
if (existsSync(join(directory, "eco.sqlite")))
  throw Error("Target already contains a database; restore to a new directory");
const bundle = await readBackup(resolve(file), process.env.BACKUP_KEY),
  store = createStore(directory, { demo: false });
try {
  await restoreLocal(bundle, resolve(file), process.env.BACKUP_KEY, store);
  console.log(
    "Restored into " +
      directory +
      ". Verify balances and photos before migration.",
  );
} finally {
  store.close();
}
