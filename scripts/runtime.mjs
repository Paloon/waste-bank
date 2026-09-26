import { resolve } from "node:path";
import { createStore } from "../server/store.js";
import { createCloudStore } from "../server/cloud-store.js";
import { createDrive } from "../server/drive.js";
import { validateConfig } from "../server/config.js";
export function runtime() {
  validateConfig();
  const directory = resolve(process.env.DATA_DIR || "data");
  const store = process.env.SUPABASE_URL
    ? createCloudStore()
    : createStore(directory, { demo: false });
  const drive = createDrive(directory, {
    secretStore: process.env.SUPABASE_URL ? store : null,
    controlStore: store,
    stateSecret: process.env.SESSION_SECRET,
  });
  return { directory, store, drive };
}
