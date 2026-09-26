import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { referencedFiles, evidenceExpired } from "./maintenance.js";
import { emptyState } from "./state.js";
import { assert } from "./errors.js";
const keyBytes = (key) => {
  assert(
    /^[a-f0-9]{64}$/i.test(key || ""),
    "BACKUP_KEY must be 64 hex characters",
  );
  return Buffer.from(key, "hex");
};
export function seal(bytes, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  const data = Buffer.concat([cipher.update(gzipSync(bytes)), cipher.final()]);
  return Buffer.concat([Buffer.from("WB02"), iv, cipher.getAuthTag(), data]);
}
export function unseal(bytes, key) {
  assert(bytes.subarray(0, 4).toString() === "WB02", "Invalid backup");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyBytes(key),
    bytes.subarray(4, 16),
  );
  decipher.setAuthTag(bytes.subarray(16, 32));
  return gunzipSync(
    Buffer.concat([decipher.update(bytes.subarray(32)), decipher.final()]),
  );
}
export async function backup(
  store,
  drive,
  directory,
  key,
  { keepDays = 7 } = {},
) {
  keyBytes(key);
  directory = resolve(directory);
  await mkdir(join(directory, "blobs"), { recursive: true });
  const state = await store.read();
  // Ephemeral work and secrets are not restored. Remove evidence already beyond retention.
  state.requests = {};
  state.mediaJobs = [];
  state.pendingDriveDeletes = [];
  for (const item of state.submissions)
    if (item.image && evidenceExpired(item)) {
      item.image = "";
      item.evidenceRemovedAt = new Date().toISOString();
    }
  const files = {};
  for (const id of referencedFiles(state)) {
    const response = await drive.download(id),
      bytes = Buffer.from(await response.arrayBuffer()),
      hash = createHash("sha256").update(bytes).digest("hex");
    const path = join(directory, "blobs", hash + ".wb");
    try {
      await writeFile(path, seal(bytes, key), { flag: "wx", mode: 0o600 });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const existing = unseal(await readFile(path), key);
      assert(
        createHash("sha256").update(existing).digest("hex") === hash,
        "Backup image checksum mismatch",
      );
    }
    files[id] = {
      hash,
      type: response.headers.get("content-type") || "image/jpeg",
    };
  }
  const at = new Date().toISOString(),
    manifest = { format: 2, at, state, files };
  const path = join(directory, at.replaceAll(":", "-") + ".wb");
  await writeFile(path, seal(Buffer.from(JSON.stringify(manifest)), key), {
    flag: "wx",
    mode: 0o600,
  });
  // Read back every written manifest before recording a successful backup.
  await readBackup(path, key);
  await store.control("put", {
    id: "health:backup",
    value: {
      at,
      files: Object.keys(files).length,
      expires: Date.now() + 30 * 86400000,
    },
  });
  await pruneBackups(directory, key, keepDays);
  return path;
}
export async function readBackup(path, key) {
  const bundle = JSON.parse(unseal(await readFile(path), key));
  assert(
    bundle.format === 2 && bundle.state && bundle.files,
    "Unsupported backup",
  );
  const folder = resolve(path, "..", "blobs");
  for (const file of Object.values(bundle.files)) {
    assert(/^[a-f0-9]{64}$/.test(file.hash), "Invalid backup filename");
    const bytes = unseal(await readFile(join(folder, file.hash + ".wb")), key);
    assert(
      createHash("sha256").update(bytes).digest("hex") === file.hash,
      "Backup image checksum mismatch",
    );
  }
  return bundle;
}
export async function restoreLocal(bundle, sourcePath, key, store) {
  const current = await store.read();
  assert(
    !current.students.length && !current.staff.length && !current.ledger.length,
    "Restore target must be empty",
  );
  const state = { ...emptyState(), ...structuredClone(bundle.state) },
    folder = resolve(sourcePath, "..", "blobs");
  const photos = new Map();
  for (const [id, file] of Object.entries(bundle.files)) {
    const bytes = unseal(await readFile(join(folder, file.hash + ".wb")), key);
    photos.set(
      `drive:${id}`,
      `data:${file.type};base64,${bytes.toString("base64")}`,
    );
  }
  for (const item of state.submissions) {
    if (evidenceExpired(item)) {
      item.image = "";
      item.evidenceRemovedAt = new Date().toISOString();
    } else if (item.image?.startsWith("drive:")) {
      assert(photos.has(item.image), "Missing image");
      item.image = photos.get(item.image);
    }
  }
  for (const reward of state.rewards) {
    if (reward.image?.startsWith("drive:"))
      reward.image = photos.get(reward.image);
    for (const image of reward.images || [])
      if (image.src?.startsWith("drive:")) image.src = photos.get(image.src);
  }
  // Restoring never resurrects old sessions, idempotency receipts or destructive cleanup jobs.
  state.requests = {};
  state.mediaJobs = [];
  state.pendingDriveDeletes = [];
  for (const account of state.staff)
    account.authVersion = (account.authVersion || 0) + 1;
  await store.transact((s) => Object.assign(s, state));
}
async function pruneBackups(directory, key, keepDays) {
  assert(
    Number.isInteger(keepDays) && keepDays >= 1 && keepDays <= 30,
    "Backup retention must be 1–30 days",
  );
  const live = new Set();
  for (const name of await readdir(directory))
    if (/^\d{4}-.*\.wb$/.test(name)) {
      const path = join(directory, name),
        bundle = JSON.parse(unseal(await readFile(path), key));
      if (Date.now() - Date.parse(bundle.at) > keepDays * 86400000)
        await unlink(path);
      else for (const file of Object.values(bundle.files)) live.add(file.hash);
    }
  for (const name of await readdir(join(directory, "blobs")))
    if (/^[a-f0-9]{64}\.wb$/.test(name) && !live.has(name.slice(0, -3)))
      await unlink(join(directory, "blobs", name));
}
