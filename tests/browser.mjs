import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../server/store.js";
const dir = mkdtempSync(join(tmpdir(), "eco-browser-"));
const server = spawn(process.execPath, ["server/index.js", "--production"], {
  env: {
    ...process.env,
    PORT: "3011",
    DATA_DIR: dir,
    DEMO_MODE: "1",
    NODE_ENV: "test",
    SUPABASE_URL: "",
    VERCEL: "",
    MAINTENANCE_DISABLED: "1",
  },
  stdio: "pipe",
});
let browser, diagnosticPage;
try {
  for (let i = 0; i < 40; i++) {
    try {
      let r = await fetch("http://127.0.0.1:3011/api/public");
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  const pin = readFileSync(join(dir, "demo-credentials.txt"), "utf8").match(
    /PIN: (\d+)/,
  )[1];
  browser = await chromium.launch({
    ...(process.env.CI ? {} : { channel: "msedge" }),
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  diagnosticPage = page;
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto("http://127.0.0.1:3011");
  assert.match(await page.title(), /waste-bank/);
  const byName = (name) =>
    page.getByRole("button", { name, exact: true }).first();
  const identify = async () => {
    // Each scenario may advance fake timers; request keys must use real server time.
    await page.clock.setSystemTime(new Date());
    await page.getByLabel("เลขประจำตัวนักเรียน", { exact: true }).fill("65001");
    await byName("ใช่ นี่คือบัญชีของฉัน").waitFor();
    await byName("ใช่ นี่คือบัญชีของฉัน").click();
  };
  let checkBadPin = true;
  const login = async () => {
    await page.clock.setSystemTime(new Date());
    await byName("เจ้าหน้าที่").click();
    await page
      .getByLabel("บัญชีเจ้าหน้าที่", { exact: true })
      .fill("teacher.mali");
    if (checkBadPin) {
      checkBadPin = false;
      await page
        .getByLabel("PIN ส่วนตัว", { exact: true })
        .fill("incorrect-pin");
      await byName("เข้าสู่ระบบ").click();
      await page
        .getByText("ชื่อบัญชีหรือ PIN ไม่ถูกต้อง", { exact: true })
        .waitFor();
      await expect(page.getByRole("dialog")).toBeVisible();
    }
    await page.getByLabel("PIN ส่วนตัว", { exact: true }).fill(pin);
    await byName("เข้าสู่ระบบ").click();
    await page.getByText("STAFF WORKSPACE").waitFor();
  };
  console.log("Testing self-registration");
  await byName("Coins ของฉัน").click();
  await byName("สมัครสมาชิกใหม่").click();
  await expect(
    page.getByLabel("คำนำหน้า").locator("option:not([disabled])"),
  ).toHaveText(["เด็กชาย", "เด็กหญิง", "นาย", "นางสาว"]);
  await byName("สมัครสมาชิก").click();
  await page.getByText("กรอกคำนำหน้าก่อนยืนยัน", { exact: true }).waitFor();
  await page.getByLabel("คำนำหน้า").selectOption("เด็กหญิง");
  await page.getByLabel("ชื่อ–นามสกุล").fill("ดารา ใจดี");
  await page.getByLabel("เลขที่", { exact: true }).fill("14");
  await page.getByLabel("เลขประจำตัวนักเรียน", { exact: true }).fill("70001");
  await page.getByLabel("ระดับชั้น").selectOption("2");
  await page.getByLabel("ห้อง", { exact: true }).fill("3");
  const registrationRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/register"),
  );
  await byName("สมัครสมาชิก").click();
  const registrationPayload = (await registrationRequest).postDataJSON();
  assert.equal(registrationPayload.name, "เด็กหญิงดารา ใจดี");
  assert.equal("title" in registrationPayload, false);
  await page
    .getByRole("heading", { name: "Coins ของฉัน", exact: true })
    .waitFor();
  await page.getByText("ดารา ใจดี").waitFor();
  const registeredStore = createStore(dir);
  const registeredStudent = registeredStore
    .read()
    .students.find((student) => student.id === "70001");
  assert.equal(registeredStudent.name, "เด็กหญิงดารา ใจดี");
  assert.equal("title" in registeredStudent, false);
  registeredStore.close();
  await byName("หน้าหลัก").click();
  console.log("Testing heartbeat retry and draft privacy");
  const openDraft = async () => {
    await byName("ส่งขยะ").click();
    await identify();
    await page
      .locator(".upload-zone input[type=file]")
      .last()
      .setInputFiles({
        name: "draft.png",
        mimeType: "image/png",
        buffer: await page.screenshot(),
      });
    await page.getByAltText("ภาพที่เลือก").waitFor();
    await page.getByLabel("จำนวน (ขวด)", { exact: true }).fill("7");
  };
  const retainedDraft = async () => {
    assert.equal(
      await page.getByLabel("จำนวน (ขวด)", { exact: true }).inputValue(),
      "7",
    );
    assert.equal(await page.getByAltText("ภาพที่เลือก").count(), 1);
  };
  await openDraft();
  let heartbeatMode = "transport",
    heartbeatCalls = 0;
  await page.route("**/api/session", async (route) => {
    heartbeatCalls++;
    if (heartbeatMode === "transport") await route.abort("failed");
    else if (heartbeatMode === "server")
      await route.fulfill({
        status: 503,
        json: { error: "temporarily unavailable" },
      });
    else await route.continue();
  });
  await page.clock.fastForward(20000);
  await page
    .getByText(
      "เชื่อมต่อไม่ได้ ข้อมูลที่กรอกยังอยู่ กรุณาลองอีกครั้งก่อนหมดเวลาใช้งาน",
    )
    .waitFor();
  await retainedDraft();
  heartbeatMode = "server";
  await page.getByLabel("จำนวน (ขวด)", { exact: true }).fill("7");
  const unavailableHeartbeat = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/session") && response.status() === 503,
  );
  await page.clock.fastForward(20000);
  await unavailableHeartbeat;
  await retainedDraft();
  heartbeatMode = "recover";
  await page.getByLabel("จำนวน (ขวด)", { exact: true }).fill("7");
  await byName("ลองเชื่อมต่ออีกครั้ง").click();
  await page
    .getByText(
      "เชื่อมต่อไม่ได้ ข้อมูลที่กรอกยังอยู่ กรุณาลองอีกครั้งก่อนหมดเวลาใช้งาน",
    )
    .waitFor({ state: "hidden" });
  assert.ok(heartbeatCalls >= 3);
  await retainedDraft();
  await page.unroute("**/api/session");
  await byName("หน้าหลัก").click();
  await byName("ส่งขยะ").click();
  await identify();
  assert.equal(await page.getByAltText("ภาพที่เลือก").count(), 0);
  assert.equal(
    await page.getByLabel("จำนวน (ขวด)", { exact: true }).inputValue(),
    "",
  );
  await byName("หน้าหลัก").click();
  await openDraft();
  await page.route("**/api/session", (route) => route.abort("failed"));
  await page.clock.fastForward(71000);
  const continuedHeartbeat = page.waitForRequest("**/api/session");
  await byName("ใช้งานต่อ").click();
  await continuedHeartbeat;
  await page
    .getByText(
      "เชื่อมต่อไม่ได้ ข้อมูลที่กรอกยังอยู่ กรุณาลองอีกครั้งก่อนหมดเวลาใช้งาน",
    )
    .waitFor();
  await retainedDraft();
  await page.clock.fastForward(91000);
  await byName("เริ่มส่งขยะ").waitFor();
  assert.equal(await page.getByAltText("ภาพที่เลือก").count(), 0);
  await page.unroute("**/api/session");
  await openDraft();
  await page.route("**/api/session", (route) =>
    route.fulfill({
      status: 401,
      json: { code: "SESSION_EXPIRED", error: "expired" },
    }),
  );
  await page.clock.fastForward(20000);
  await byName("เริ่มส่งขยะ").waitFor();
  assert.equal(await page.getByAltText("ภาพที่เลือก").count(), 0);
  await page.unroute("**/api/session");
  await openDraft();
  let releaseHeartbeat;
  const heartbeatArrived = new Promise((resolve) => {
    page.route("**/api/session", async (route) => {
      releaseHeartbeat = () =>
        route
          .fulfill({ status: 401, json: { code: "SESSION_EXPIRED" } })
          .catch(() => {});
      resolve();
      await new Promise((done) => {
        const release = releaseHeartbeat;
        releaseHeartbeat = async () => {
          await release();
          done();
        };
      });
    });
  });
  await page.clock.fastForward(20000);
  await heartbeatArrived;
  await byName("หน้าหลัก").click();
  await byName("Coins ของฉัน").click();
  await page.getByLabel("เลขประจำตัวนักเรียน", { exact: true }).fill("70001");
  await byName("ใช่ นี่คือบัญชีของฉัน").click();
  await page.getByText("ดารา ใจดี").waitFor();
  await releaseHeartbeat();
  await page.unroute("**/api/session");
  assert.ok(await page.getByText("ดารา ใจดี").isVisible());
  assert.equal(await page.getByAltText("ภาพที่เลือก").count(), 0);
  await byName("หน้าหลัก").click();
  console.log("Testing submission");
  await byName("ส่งขยะ").click();
  await identify();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { name: "ก่อนถ่ายรูป" }).waitFor();
  assert.ok(
    await page.getByRole("heading", { name: "ก่อนถ่ายรูป" }).isVisible(),
  );
  assert.ok(await page.locator(".submission-feedback").isVisible());
  assert.ok(await byName("เปลี่ยนบัญชี").isVisible());
  assert.equal(
    await page.getByText("ยืนยันบัญชีแล้ว", { exact: true }).count(),
    0,
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .locator(".upload-zone input[type=file]")
    .last()
    .setInputFiles({
      name: "evidence.png",
      mimeType: "image/png",
      buffer: await page.screenshot(),
    });
  await page.getByAltText("ภาพที่เลือก").waitFor();
  await page
    .getByText("เพิ่มรูปถังหรือจุดทิ้ง (รูปที่ 2 ไม่บังคับ)", { exact: true })
    .click();
  await page.getByLabel("เลือกรูปจุดทิ้ง", { exact: true }).setInputFiles({
    name: "bin.png",
    mimeType: "image/png",
    buffer: await page.screenshot(),
  });
  await page.getByAltText("ภาพถังหรือจุดทิ้งที่เลือก").waitFor();

  assert.equal(
    await page
      .locator(".category-grid")
      .getByRole("button", { name: /กระดาษลัง/ })
      .count(),
    0,
  );
  await page
    .locator(".category-grid")
    .getByRole("button", { name: /ซองขนม/ })
    .click();
  await page.getByLabel("จำนวน (ซอง)", { exact: true }).fill("3");
  await page.getByText("คาดว่าจะได้ 3 Coins", { exact: true }).waitFor();
  assert.ok(await byName("ส่งรูปให้คุณครูตรวจ").isEnabled());
  await page
    .locator(".category-grid")
    .getByRole("button", { name: /ถุงพลาสติก/ })
    .click();
  await page.getByLabel("จำนวน (ถุง)", { exact: true }).waitFor();
  await page
    .locator(".category-grid")
    .getByRole("button", { name: /ขวดพลาสติก/ })
    .click();

  assert.ok(
    await page
      .getByAltText("ภาพที่เลือก")
      .evaluate(
        (el) => Math.floor((el.src.split(",")[1].length * 3) / 4) <= 400 * 1024,
      ),
  );
  await page.getByLabel("จำนวน (ขวด)", { exact: true }).fill("3");
  await page.getByText("คาดว่าจะได้ 15 Coins", { exact: true }).waitFor();
  let lostSubmit = false;
  await page.route("**/api/action", async (route) => {
    if (!lostSubmit && route.request().postDataJSON()?.action === "submit") {
      lostSubmit = true;
      const committed = await route.fetch(); // Server committed; intentionally drop its response.
      assert.equal(committed.status(), 200);
      await route.abort("failed");
    } else await route.continue();
  });
  await byName("ส่งรูปให้คุณครูตรวจ").click();
  await page
    .getByRole("alert")
    .filter({ hasText: "เชื่อมต่อไม่ได้ กรุณาลองรายการเดิมอีกครั้ง" })
    .waitFor();
  assert.equal(
    await page.getByLabel("จำนวน (ขวด)", { exact: true }).inputValue(),
    "3",
  );
  await page.getByAltText("ภาพที่เลือก").waitFor();
  await page.getByAltText("ภาพถังหรือจุดทิ้งที่เลือก").waitFor();
  await byName("ส่งรายการเดิมอีกครั้ง").click();
  await page.getByRole("heading", { name: "ส่งขยะเรียบร้อย!" }).waitFor();
  await page.unroute("**/api/action");
  const retryStore = createStore(dir);
  const submitted = retryStore
    .read()
    .submissions.filter(
      (x) => x.submittedCount === 3 && x.category === "ขวดพลาสติก",
    );
  assert.equal(submitted.length, 1);
  assert.match(submitted[0].disposalImage, /^data:image/);
  retryStore.close();
  await byName("กลับหน้าหลัก").click();
  console.log("Testing approval");
  await login();
  await expect(
    page
      .locator(".stat-card")
      .filter({ hasText: "รอตรวจขยะ" })
      .locator("strong"),
  ).toHaveText("5");
  assert.equal(
    await page.locator(".staff-system-details").getAttribute("open"),
    null,
  );
  await page.getByRole("button", { name: /^ตรวจขยะ/ }).click();
  await byName("อนุมัติ").last().click();
  const proof = await page.locator(".review-proof").boundingBox();
  const decision = await page.locator(".review-decision").boundingBox();
  assert.ok(
    decision.x > proof.x + proof.width,
    "desktop proof sits beside correction fields",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileProof = await page.locator(".review-proof").boundingBox();
  const mobileDecision = await page.locator(".review-decision").boundingBox();
  assert.ok(
    mobileDecision.y > mobileProof.y,
    "mobile review stacks proof and fields",
  );
  assert.equal(
    await page
      .locator(".review-modal")
      .evaluate((element) => element.scrollWidth > element.clientWidth),
    false,
    "review does not overflow sideways",
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByLabel("จำนวนที่ครูตรวจพบ").fill("1.5");
  await byName("ยืนยันผลการตรวจ").click();
  await page
    .getByText("จำนวนที่ครูตรวจพบต้องเป็นจำนวนเต็ม", { exact: true })
    .waitFor();
  await expect(page.getByLabel("จำนวนที่ครูตรวจพบ")).toBeFocused();
  await page.getByLabel("จำนวนที่ครูตรวจพบ").fill("2");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ไม่ผ่าน", exact: true })
    .click();
  await page
    .getByLabel("เหตุผลที่ไม่อนุมัติ")
    .fill("เหตุผลนี้ไม่ใช้เมื่อเลือกอนุมัติ");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "อนุมัติ", exact: true })
    .click();
  await expect(page.getByLabel("จำนวนที่ครูตรวจพบ")).toHaveValue("2");
  await page.getByText("มอบให้ 10 Coins", { exact: true }).waitFor();
  await byName("ยืนยันผลการตรวจ").click();
  await page.getByText("บันทึกผลตรวจแล้ว").waitFor();
  console.log("Testing rejection presets and student statuses");
  await page
    .locator(".review-card")
    .filter({ hasText: "65001" })
    .getByRole("button", { name: "ไม่อนุมัติ", exact: true })
    .click();
  await page
    .getByRole("group", { name: "เลือกเหตุผลไม่ผ่านแบบเร็ว" })
    .getByRole("button", { name: "นับจำนวนไม่ได้", exact: true })
    .click();
  const rejection =
    "นับจำนวนขยะจากภาพไม่ได้ กรุณาจัดขยะให้เห็นครบก่อนถ่าย กรุณาถ่ายจากด้านบน";
  assert.match(
    await page.getByLabel("เหตุผลที่ไม่อนุมัติ").inputValue(),
    /นับจำนวนขยะจากภาพไม่ได้/,
  );
  await page.getByLabel("เหตุผลที่ไม่อนุมัติ").fill(rejection);
  await byName("ยืนยันผลการตรวจ").click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await byName("ออกจากระบบ").click();
  await byName("Coins ของฉัน").click();
  await identify();
  await page
    .getByRole("heading", { name: "สถานะรายการของฉัน", exact: true })
    .waitFor();
  await page.getByRole("button", { name: /^ไม่ผ่าน / }).click();
  await page.getByText(rejection, { exact: true }).waitFor();
  await expect(page.locator(".student-submission.approved")).toHaveCount(0);
  await byName("อัปเดตสถานะ").click();
  await page.getByText(rejection, { exact: true }).waitFor();
  await page.getByRole("button", { name: /^อนุมัติแล้ว / }).click();
  await page.getByText("+10 Coins", { exact: true }).waitFor();
  await page.getByText("ครูปรับข้อมูลให้ตรงกับรูป", { exact: true }).waitFor();
  await expect(page.locator(".correction-comparison")).toContainText("3 ขวด");
  await expect(page.locator(".correction-comparison")).toContainText("2 ขวด");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "student status mobile overflow",
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await byName("หน้าหลัก").click();
  await login();
  console.log("Testing period reports");
  await byName("รายงานตามช่วงเวลา").click();
  await page.locator(".report-metrics").waitFor();
  await byName("วันนี้").click();
  await page.locator(".report-metrics").waitFor();
  await page
    .locator(".report-tabs")
    .getByRole("button", { name: "ขยะ", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "ขยะแยกประเภท", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  for (const label of ["Coins", "นักเรียน", "รางวัล", "สรุป"]) {
    await page
      .locator(".report-tabs")
      .getByRole("button", { name: label, exact: true })
      .click();
    await page.locator(".report-metrics").waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page
    .getByRole("button", { name: /^ดูรายละเอียดวันที่/ })
    .first()
    .click();
  await byName("ดูทั้งช่วง").waitFor();
  await byName("ดูทั้งช่วง").click();
  await page.locator(".report-metrics").waitFor();
  await page.getByLabel("วันเริ่มรายงาน").fill("2001-01-01");
  await page.getByLabel("วันสิ้นสุดรายงาน").fill("2001-01-01");
  await byName("ดูรายงาน").click();
  await page.getByText("ไม่พบรายการในช่วงที่เลือก", { exact: true }).waitFor();
  await byName("รีเฟรช").click();
  await page.locator(".report-metrics").waitFor();
  await page.setViewportSize({ width: 1280, height: 900 });
  await byName("ออกจากระบบ").click();
  await byName("ร้านรางวัล").click();
  await byName("แลกรางวัล").first().click();
  await identify();
  await byName("ยืนยันแลก 150 Coins").click();
  await page.getByRole("heading", { name: "จองรางวัลแล้ว!" }).waitFor();
  const pickupCode = await page.locator(".pickup-code strong").innerText();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await byName("คัดลอกรหัส").click();
  await page.getByText("คัดลอกรหัสรับรางวัลแล้ว", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    pickupCode,
  );
  await page.clock.fastForward(13000);
  assert.ok(
    await page.getByRole("heading", { name: "จองรางวัลแล้ว!" }).isVisible(),
  );
  await byName("ใช้งานต่อ").click();
  await page.clock.fastForward(50000);
  assert.ok(
    await page.getByRole("heading", { name: "จองรางวัลแล้ว!" }).isVisible(),
  );
  assert.match(
    await page.locator(".success-screen > small").innerText(),
    /10 วินาที/,
  );
  await page.clock.fastForward(11000);
  await byName("เริ่มส่งขยะ").waitFor();
  assert.equal(await page.locator(".pickup-code").count(), 0);
  await byName("Coins ของฉัน").click();
  await identify();
  await byName("ประวัติ Coins").click();
  assert.ok(await page.getByText("แลก สมุดรักษ์โลก", { exact: true }).count());
  await byName("ประวัติรางวัล").click();
  assert.ok(await page.locator("code").count());
  await byName("หน้าหลัก").click();
  await login();
  await byName("ส่งมอบรางวัล").click();
  await byName("ยกเลิกและคืน Coins").last().click();
  await page.getByLabel("เหตุผล", { exact: true }).fill("คืนรายการทดสอบ");
  await byName("ยืนยัน").click();
  await page.getByText("บันทึกรายการแล้ว", { exact: true }).waitFor();
  await byName("นักเรียน").click();
  await byName("ปรับ Coins").first().click();
  await page.getByLabel("จำนวน (+ เพิ่ม / − ลด)").fill("100");
  await page.getByLabel("เหตุผล", { exact: true }).fill("กิจกรรมโรงเรียน");
  await byName("ยืนยันและบันทึกในบัญชี").click();
  await page.getByText("สร้างรายการปรับ Coins แล้ว").waitFor();
  await byName("เลื่อนชั้น").click();
  await page.getByRole("button", { name: /ตรวจสอบครบแล้ว/ }).click();
  await byName("ยืนยันเลื่อนชั้น").click();
  await page.getByText("เลื่อนชั้นเรียบร้อย ประวัติและ Coins คงเดิม").waitFor();
  await byName("ออกจากระบบ").click();
  console.log("Testing reward gallery");
  await login();
  await byName("จัดการรางวัล").click();
  await byName("แก้ไขรางวัล").first().click();
  const photo = await page.screenshot();
  await page.locator(".reward-editor input[type=file]").setInputFiles([
    { name: "front.png", mimeType: "image/png", buffer: photo },
    { name: "back.png", mimeType: "image/png", buffer: photo },
  ]);
  await page.getByRole("button", { name: "แก้ไขรูปที่ 2" }).waitFor();
  await page.locator(".reward-editor input[type=range]").focus();
  await page.locator(".reward-editor input[type=range]").press("End");
  await byName("บันทึกรางวัล").click();
  await page.getByText("บันทึกรางวัลแล้ว").waitFor();
  await byName("ออกจากระบบ").click();
  await byName("ร้านรางวัล").click();
  await page.getByRole("button", { name: "รูปถัดไป" }).first().click();
  await page
    .getByRole("button", { name: "ดูรูป สมุดรักษ์โลก แบบเต็ม" })
    .click();
  await page.getByRole("dialog", { name: "ภาพขยาย" }).waitFor();
  await page
    .getByRole("dialog", { name: "ภาพขยาย" })
    .getByRole("button", { name: "รูปถัดไป" })
    .click();
  await page
    .getByRole("dialog", { name: "ภาพขยาย" })
    .getByRole("button", { name: "ปิดภาพ" })
    .click();
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const target of ["ร้านรางวัล", "อันดับ", "หน้าหลัก"]) {
      await byName(target).click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `overflow ${target} at ${width}`,
      );
    }
  }
  await byName("Coins ของฉัน").click();
  await identify();
  await page
    .getByRole("heading", { name: "Coins ของฉัน", exact: true })
    .waitFor();
  await page.clock.fastForward(91000);
  await page.getByRole("heading", { name: "ขยะของเธอ" }).waitFor();
  assert.equal(await page.getByText("ปุณณ์ สุขใจ", { exact: true }).count(), 0);
  await byName("ส่งขยะ").click();
  await page.getByLabel("เลขประจำตัวนักเรียน", { exact: true }).fill("65001");
  await byName("ใช่ นี่คือบัญชีของฉัน").waitFor();
  await page.clock.fastForward(91000);
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.getByText("ปุณณ์ สุขใจ", { exact: true }).count(), 0);
  console.log("Testing bulk student deletion");
  await login();
  await byName("นักเรียน").click();
  await page.getByLabel("เลือก ปุณณ์ สุขใจ").check();
  await page.getByLabel("เลือก ณิชา ใจดี").check();
  await byName("ลบที่เลือก (2)").click();
  await page.getByRole("heading", { name: "ลบนักเรียน 2 คน?" }).waitFor();
  await page
    .getByLabel("ยืนยันว่าตรวจรายชื่อแล้วและต้องการลบข้อมูลเหล่านี้")
    .check();
  await page.getByLabel("ยืนยัน PIN เจ้าหน้าที่").fill(pin);
  await byName("ยืนยันลบ 2 คน").click();
  await page.getByText("ลบนักเรียน 2 คนและข้อมูลที่เกี่ยวข้องแล้ว").waitFor();
  assert.equal(await page.getByLabel("เลือก ปุณณ์ สุขใจ").count(), 0);
  assert.equal(await page.getByLabel("เลือก ณิชา ใจดี").count(), 0);
  console.log("Testing server pagination");
  const fixtureStore = createStore(dir, { demo: false });
  fixtureStore.transact((s) => {
    for (let i = 0; i < 60; i++)
      s.students.push({
        id: String(90000 + i),
        name: "Pagination " + i,
        grade: "1",
        room: "1",
        number: i + 1,
        status: "Inactive",
      });
    s.students.push({
      id: "80001",
      name: "นักเรียนทดสอบประวัติ",
      grade: "4",
      room: "29",
      number: 59,
      status: "Active",
    });
    for (let i = 0; i < 120; i++)
      s.submissions.push({
        id: `history-${String(i).padStart(3, "0")}`,
        student: "80001",
        category: "ขวดพลาสติก",
        count: 1,
        status: i < 60 ? "Pending" : "Rejected",
        at: new Date(Date.now() - i * 60000).toISOString(),
        image: "",
        reason: i >= 60 ? "หลักฐานทดสอบไม่ชัด" : "",
      });
  });
  fixtureStore.close();
  await byName("รีเฟรช").click();
  await byName("หน้าถัดไป").click();
  await page.getByText("หน้า 2", { exact: true }).waitFor();
  await page.getByLabel("เลือก Pagination 59").waitFor();
  await byName("หน้าก่อน").click();
  await page.getByText("หน้า 1", { exact: true }).waitFor();
  console.log("Testing full student history filters beyond 50 entries");
  await byName("ออกจากระบบ").click();
  await page.clock.setSystemTime(new Date());
  await byName("Coins ของฉัน").click();
  await page.getByLabel("เลขประจำตัวนักเรียน", { exact: true }).fill("80001");
  await byName("ใช่ นี่คือบัญชีของฉัน").click();
  await byName("ทั้งหมด 120").waitFor();
  await expect(page.locator(".student-submission.pending")).toHaveCount(50);
  await byName("ไม่ผ่าน 60").click();
  await expect(page.locator(".student-submission.rejected")).toHaveCount(50);
  await expect(page.locator(".student-submission.pending")).toHaveCount(0);
  await byName("ถัดไป").click();
  await expect(page.locator(".student-submission.rejected")).toHaveCount(10);
  await byName("ไม่ผ่าน 60").waitFor();
  await byName("รอตรวจ 60").click();
  await expect(page.locator(".student-submission.pending")).toHaveCount(50);
  await expect(
    page
      .getByRole("region", { name: "สถานะรายการส่งของฉัน" })
      .getByText("หน้า 1", { exact: true }),
  ).toBeVisible();
  await byName("หน้าหลัก").click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: self-registration → upload → approve → redeem → history → refund → adjustment → promotion → reward gallery → responsive → privacy timeout → bulk deletion; no browser errors",
  );
} catch (error) {
  if (diagnosticPage)
    console.error(
      JSON.stringify({
        uiErrors: await diagnosticPage
          .locator(".field-error,.alert")
          .allTextContents(),
        headings: await diagnosticPage.getByRole("heading").allTextContents(),
      }),
    );
  throw error;
} finally {
  await browser?.close();
  server.kill();
  await new Promise((r) => server.once("exit", r));
  rmSync(dir, { recursive: true, force: true });
}
