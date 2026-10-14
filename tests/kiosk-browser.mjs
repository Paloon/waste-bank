import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolated fixtures only; this never opens the deployed app or real student data.
const directory = mkdtempSync(join(tmpdir(), "eco-kiosk-browser-"));
const origin = "http://127.0.0.1:3012";
const server = spawn(process.execPath, ["server/index.js", "--production"], {
  env: {
    ...process.env,
    PORT: "3012",
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
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if ((await fetch(origin + "/api/public")).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({
    ...(process.env.CI ? {} : { channel: "msedge" }),
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  await page.goto(origin);
  const button = (name) =>
    page.getByRole("button", { name, exact: true }).first();
  const identify = async () => {
    await page.clock.setSystemTime(new Date());
    await button("ส่งขยะ").click();
    await page.getByLabel("เลขประจำตัวนักเรียน", { exact: true }).fill("65001");
    await button("ใช่ นี่คือบัญชีของฉัน").click();
    await page.getByRole("heading", { name: "ก่อนถ่ายรูป" }).waitFor();
  };
  const addPhoto = async () => {
    await page
      .locator(".upload-zone input[type=file]")
      .last()
      .setInputFiles({
        name: "fixture.png",
        mimeType: "image/png",
        buffer: await page.screenshot(),
      });
    await page.getByAltText("ภาพที่เลือก").waitFor();
  };
  const count = () => page.getByLabel("จำนวน (ขวด)", { exact: true });
  const home = () => button("เริ่มส่งขยะ").waitFor();
  console.log("Testing mobile submit validation and focus");
  await identify();
  await button("ส่งรูปให้คุณครูตรวจ").click();
  await expect(
    page.getByText("เพิ่มรูปขยะก่อนส่งให้คุณครูตรวจ", { exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.field),
    "photo",
  );
  await addPhoto();
  await count().fill("1.5");
  await button("ส่งรูปให้คุณครูตรวจ").click();
  await expect(count()).toBeFocused();
  await expect(count()).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("กรอกจำนวนเต็มตั้งแต่ 1 ถึง 1000", { exact: true }),
  ).toBeVisible();
  await count().fill("7");
  await expect(count()).toHaveAttribute("aria-invalid", "false");
  const bounds = await button("ส่งรูปให้คุณครูตรวจ").boundingBox();
  assert.ok(bounds.y + bounds.height <= 844 && bounds.y > 700);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await expect(page.locator(".coin-estimate .gold-coin-icon")).toBeVisible();

  console.log(
    "Testing loading feedback and retry keeps the same draft receipt",
  );
  let releaseAction;
  await page.route("**/api/action", async (route) => {
    await new Promise((resolve) => {
      releaseAction = async () => {
        await route.abort("failed");
        resolve();
      };
    });
  });
  const firstAction = page.waitForRequest("**/api/action");
  await button("ส่งรูปให้คุณครูตรวจ").click();
  const firstReceipt = (await firstAction).postDataJSON().key;
  await expect(button("กำลังดำเนินการ…")).toBeDisabled();
  await expect(
    page.getByText("กำลังเตรียมรูปหรือส่งรายการ กรุณารอสักครู่", {
      exact: true,
    }),
  ).toBeVisible();
  await releaseAction();
  await expect(button("ส่งรายการเดิมอีกครั้ง")).toBeVisible();
  assert.equal(await count().inputValue(), "7");
  assert.equal(await page.getByAltText("ภาพที่เลือก").count(), 1);
  await page.unroute("**/api/action");
  await page.route("**/api/action", (route) => route.abort("failed"));
  const retryAction = page.waitForRequest("**/api/action");
  await button("ส่งรายการเดิมอีกครั้ง").click();
  assert.equal((await retryAction).postDataJSON().key, firstReceipt);
  await expect(button("ส่งรูปให้คุณครูตรวจ")).toBeEnabled();
  await page.unroute("**/api/action");

  console.log("Testing actual browser Back clears authenticated draft");
  await page.evaluate(() => history.pushState({}, "", "#kiosk-check"));
  await page.goBack();
  await home();
  assert.equal(await page.getByAltText("ภาพที่เลือก").count(), 0);
  await identify();
  assert.equal(await count().inputValue(), "");

  console.log("Testing refresh does not restore account or photos");
  await addPhoto();
  await count().fill("7");
  await page.reload();
  await home();
  assert.equal(await page.getByAltText("ภาพที่เลือก").count(), 0);
  assert.equal(
    await page.evaluate(() =>
      fetch("/api/student").then((response) => response.status),
    ),
    401,
  );

  console.log("Testing BFCache and visibility privacy boundaries");
  await identify();
  await addPhoto();
  await count().fill("7");
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  await home();
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await home();
  assert.equal(await page.getByAltText("ภาพที่เลือก").count(), 0);
  await identify();
  assert.equal(await count().inputValue(), "");
  await addPhoto();
  await count().fill("7");
  await page.clock.fastForward(91_000);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await home();
  assert.equal(await page.getByAltText("ภาพที่เลือก").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: mobile validation/focus, Back, refresh, BFCache lifecycle and idle privacy",
  );
} finally {
  await browser?.close();
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill();
  await exited;
  rmSync(directory, { recursive: true, force: true });
}
