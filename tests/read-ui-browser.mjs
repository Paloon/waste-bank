import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../server/store.js";

const directory = mkdtempSync(join(tmpdir(), "eco-read-ui-"));
const origin = "http://127.0.0.1:3013";
const store = createStore(directory, { demo: true });
store.transact((s) => {
  for (let i = 0; i < 130; i++)
    s.students.push({
      id: String(90000 + i),
      name: `Synthetic ${i} Student`,
      number: (i % 60) + 1,
      grade: "2",
      room: String(Math.floor(i / 60) + 1),
      status: "Active",
    });
});
store.close();
const pin = readFileSync(join(directory, "demo-credentials.txt"), "utf8").match(
  /PIN: (\d+)/,
)[1];
const server = spawn(process.execPath, ["server/index.js", "--production"], {
  env: {
    ...process.env,
    PORT: "3013",
    DATA_DIR: directory,
    DEMO_MODE: "1",
    NODE_ENV: "test",
    SUPABASE_URL: "",
    VERCEL: "",
    MAINTENANCE_DISABLED: "1",
  },
  stdio: "pipe",
});
let browser;
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(origin + "/api/public")).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({
    ...(process.env.CI ? {} : { channel: "msedge" }),
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  await page.goto(origin);
  const button = (name) =>
    page.getByRole("button", { name, exact: true }).first();
  console.log(
    "Testing dedicated leaderboard filters and stale read cancellation",
  );
  await button("อันดับ").click();
  await expect(page.locator(".leader-row")).toHaveCount(10);
  const grade = page.getByLabel("กรองระดับชั้น");
  let release;
  let captured;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    captured = resolve;
  });
  await page.route("**/api/leaderboard?**", async (route) => {
    const selected = new URL(route.request().url()).searchParams.get("grade");
    if (selected !== "1") return route.continue();
    captured();
    await delayed;
    await route
      .fulfill({
        json: [
          {
            name: "STALE LEADER",
            grade: "1",
            room: "1",
            earned: 999,
            monthly: 999,
          },
        ],
      })
      .catch(() => {});
  });
  await grade.selectOption("1");
  await started;
  const next = page.waitForResponse(
    (r) =>
      r.url().includes("/api/leaderboard?") &&
      new URL(r.url()).searchParams.get("grade") === "2",
  );
  await grade.selectOption("2");
  await next;
  await expect(page.locator(".leader-row")).toHaveCount(10);
  release();
  await expect(page.getByText("STALE LEADER")).toHaveCount(0);
  await page.unroute("**/api/leaderboard?**");
  await button("เดือนนี้").click();
  await expect(page.locator(".leader-row")).toHaveCount(10);

  console.log(
    "Testing paged student search, no duplicate initial admin read and stable form during idle warning",
  );
  await button("หน้าหลัก").click();
  await button("เจ้าหน้าที่").click();
  await page
    .getByLabel("บัญชีเจ้าหน้าที่", { exact: true })
    .fill("teacher.mali");
  await page.getByLabel("PIN ส่วนตัว", { exact: true }).fill(pin);
  let dashboardReads = 0;
  page.on("request", (req) => {
    if (
      req.url().includes("/api/admin?") &&
      new URL(req.url()).searchParams.get("tab") === "dashboard"
    )
      dashboardReads++;
  });
  await button("เข้าสู่ระบบ").click();
  await page.getByText("STAFF WORKSPACE").waitFor();
  // Advancing timers flushes the old redundant initial effect, if reintroduced.
  await page.clock.fastForward(1000);
  assert.equal(dashboardReads, 1);
  await button("นักเรียน").click();
  await expect(page.locator(".admin-content tbody tr")).toHaveCount(50);
  await button("หน้าถัดไป").click();
  await page.getByText("หน้า 2", { exact: true }).waitFor();
  await expect(page.locator(".admin-content tbody tr")).toHaveCount(50);
  await page.getByLabel("ค้นหานักเรียน").fill("Synthetic 129");
  await expect(page.locator(".admin-content tbody tr")).toHaveCount(1);
  await expect(page.locator(".admin-content tbody")).toContainText(
    "Synthetic 129 Student",
  );
  await page.getByText("หน้า 1", { exact: true }).waitFor();
  await button("แก้ไข").click();
  const name = page.getByLabel("ชื่อ–นามสกุล", { exact: true });
  await page.clock.fastForward(50);
  await name.fill("");
  await button("บันทึกข้อมูล").click();
  await page.getByText("กรอกชื่อ–นามสกุลก่อนยืนยัน", { exact: true }).waitFor();
  await expect(name).toBeFocused();
  await name.fill("Edited name remains during warning");
  await page.clock.fastForward(71000);
  await page.getByText(/จะออกจากระบบใน/).waitFor();
  await expect(name).toHaveValue("Edited name remains during warning");
  await expect(name).toBeFocused();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: leaderboard race, database-backed student paging/search, admin read dedupe and stable profile input",
  );
} finally {
  await browser?.close();
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill();
  await exited;
  rmSync(directory, { recursive: true, force: true });
}
