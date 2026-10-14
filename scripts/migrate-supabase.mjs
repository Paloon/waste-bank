import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createStore } from "../server/store.js";
import { createCloudStore } from "../server/cloud-store.js";
import { createDrive } from "../server/drive.js";
import { importRecovery } from "../server/recovery-import.js";

const directory = resolve(process.env.DATA_DIR || "data");
if (!existsSync(join(directory, "eco.sqlite")))
  throw Error(
    "Source SQLite database does not exist; migration never auto-seeds production data",
  );
const local = createStore(directory, { demo: false }),
  cloud = createCloudStore();
try {
  const drive = createDrive(directory, {
    controlStore: local,
    stateSecret: process.env.SESSION_SECRET,
  });
  const result = await importRecovery({
    local,
    cloud,
    drive,
    allowDemo: process.env.DEMO_MODE === "1",
  });
  const oauth = join(directory, "drive-oauth.json");
  if (existsSync(oauth))
    await cloud.setSecret(
      "drive_oauth",
      JSON.parse(readFileSync(oauth, "utf8")),
    );
  console.log(
    JSON.stringify({
      ...result,
      message:
        "Imported and verified target records and image downloads; verify deployment before opening kiosk",
    }),
  );
} finally {
  local.close();
}
