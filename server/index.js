import express from "express";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createStore } from "./store.js";
import { createCloudStore } from "./cloud-store.js";
import { createDrive } from "./drive.js";
import { createApp } from "./app.js";
import { maintenance } from "./maintenance.js";
import { report } from "./monitor.js";
import { validateConfig, deploymentBaseUrl } from "./config.js";
validateConfig();

const directory = resolve(process.env.DATA_DIR || "data");
const production =
  process.env.NODE_ENV !== "test" &&
  (process.env.NODE_ENV === "production" ||
    Boolean(process.env.VERCEL) ||
    process.argv.includes("--production"));
const cloud = Boolean(process.env.SUPABASE_URL);
if (process.env.VERCEL && !cloud) throw new Error("Vercel requires Supabase");
if (
  production &&
  (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
)
  throw new Error("Set a random SESSION_SECRET of at least 32 bytes");
if (production && !deploymentBaseUrl().startsWith("https://"))
  throw new Error("Set HTTPS WASTE_BANK_BASE_URL or PUBLIC_BASE_URL");
const store = cloud ? createCloudStore() : createStore(directory);
const drive = createDrive(directory, {
  secretStore: cloud ? store : null,
  controlStore: store,
  stateSecret: process.env.SESSION_SECRET || randomBytes(32).toString("hex"),
});
const app = createApp({
  store,
  drive,
  production,
  secure: production || process.env.SECURE_COOKIE === "1",
});
if (!process.env.VERCEL) {
  if (process.argv.includes("--production")) {
    app.use(express.static(resolve("dist")));
    app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`waste-bank: http://localhost:${port}`),
  );
  if (process.env.MAINTENANCE_DISABLED !== "1") {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        await maintenance(store, drive);
      } catch {
        await report(store, "MAINTENANCE_FAILED");
      } finally {
        running = false;
      }
    };
    run();
    setInterval(run, 3600000).unref();
  }
}
export default app;
