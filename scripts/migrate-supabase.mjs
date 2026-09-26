import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createStore } from "../server/store.js";
import { createCloudStore } from "../server/cloud-store.js";
import { createDrive } from "../server/drive.js";
import { normalizeImage } from "../server/images.js";
import { reconcile } from "../server/reconcile.js";

const directory = resolve(process.env.DATA_DIR || "data");
if (!existsSync(join(directory, "eco.sqlite")))
  throw Error(
    "Source SQLite database does not exist. Initialize staff first; never auto-seed a production migration.",
  );
const local = createStore(directory, { demo: false }),
  cloud = createCloudStore();
try {
  if (await cloud.initialized())
    throw Error(
      "Target is not empty. For an existing deployment apply schema.sql; this import never overwrites data or OAuth credentials.",
    );
  let state = local.read();
  if (
    state.staff.some((x) => x.id === "teacher.mali" && x.enabled !== false) &&
    process.env.DEMO_MODE !== "1"
  )
    throw Error(
      "Disable the demo staff account and create a real staff account before migration.",
    );
  if (!reconcile(state).ok)
    throw Error("Reconciliation failed. Repair the source before migration.");
  const drive = createDrive(directory, {
    controlStore: local,
    stateSecret: process.env.SESSION_SECRET,
  });
  const targets = [
    ...state.submissions.map((x) => ({
      kind: "submissions",
      id: x.id,
      field: "image",
      value: x.image,
      folder: "evidence",
    })),
    ...state.rewards.flatMap((x) =>
      x.images?.length
        ? x.images.map((image, index) => ({
            kind: "rewards",
            id: x.id,
            index,
            value: image.src,
            folder: "rewards",
          }))
        : [
            {
              kind: "rewards",
              id: x.id,
              field: "image",
              value: x.image,
              folder: "rewards",
            },
          ],
    ),
  ];
  for (const target of targets)
    if (target.value?.startsWith("data:")) {
      if (!(await drive.connected()))
        throw Error(
          "Connect Drive locally before migrating inline images. Restored snapshots require reauthorization.",
        );
      await drive.verifyFolders();
      const uri = await normalizeImage(target.value),
        id = await drive.allocateId();
      local.transact((s) =>
        s.mediaJobs.push({ id, kind: "upload", at: new Date().toISOString() }),
      );
      await drive.upload(target.folder, uri, `migration-${id}.jpg`, id);
      local.transact((s) => {
        const item = s[target.kind].find((x) => x.id === target.id);
        if (target.index !== undefined) {
          item.images[target.index].src = `drive:${id}`;
          item.image = item.images[0].src;
        } else item.image = `drive:${id}`;
      });
    }
  state = local.read();
  const imported = await cloud.initialize(state);
  if (!imported)
    throw Error(
      "Target changed during import; source is unchanged except migrated image references.",
    );
  const oauth = join(directory, "drive-oauth.json");
  if (existsSync(oauth))
    await cloud.setSecret(
      "drive_oauth",
      JSON.parse(readFileSync(oauth, "utf8")),
    );
  console.log(
    "Imported atomically. Verify production balances and images before opening the kiosk.",
  );
} finally {
  local.close();
}
