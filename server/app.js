import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { policy } from "../shared/policy.js";
import { createSecurity } from "./security.js";
import { AppError, assert } from "./errors.js";
import { verifyAsync, hash } from "./credentials.js";
import { categories, registerStudent } from "./store.js";
import {
  actionBody,
  parse,
  studentId,
  registration,
  staffLogin,
} from "./validation.js";
import { performAction } from "./actions.js";
import {
  summary,
  publicStudent,
  rewardView,
  rewardImages,
  submissionView,
  ranked,
} from "./views.js";
import { promotionVersion, schoolYear } from "./state.js";
import { audit, report } from "./monitor.js";
import { maintenance } from "./maintenance.js";
import { deploymentBaseUrl } from "./config.js";

export function createApp({
  store,
  drive,
  production = false,
  secure = false,
  baseUrl = deploymentBaseUrl(),
}) {
  const app = express(),
    security = createSecurity(store, { secure });
  const dummyPin = hash(randomBytes(24).toString("hex"));
  if (process.env.VERCEL) app.set("trust proxy", 1);
  else if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    });
    if (production) {
      res.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      if (secure) res.set("Strict-Transport-Security", "max-age=31536000");
    }
    if (secure && !req.secure) {
      if (req.method === "GET" && baseUrl)
        return res.redirect(308, new URL(baseUrl).origin + req.originalUrl);
      return res.status(400).json({ error: "กรุณาใช้ HTTPS" });
    }
    if (req.path.startsWith("/api")) {
      res.set("Cache-Control", "no-store");
      if (req.method === "POST") {
        const origin = baseUrl
          ? new URL(baseUrl).origin
          : `${req.protocol}://${req.get("host")}`;
        if (
          req.headers["sec-fetch-site"] === "cross-site" ||
          (req.headers.origin && req.headers.origin !== origin)
        )
          return res.status(403).json({ error: "แหล่งที่มาของคำขอไม่ถูกต้อง" });
        if (!req.is("application/json"))
          return res.status(415).json({ error: "รูปแบบคำขอไม่ถูกต้อง" });
      }
    }
    next();
  });
  app.use(express.json({ limit: "3mb" }));
  let cachedPublic = null;
  app.get("/api/public", async (req, res) => {
    if (!cachedPublic || cachedPublic.until < Date.now()) {
      const s = await summary(store);
      cachedPublic = {
        until: Date.now() + 15000,
        data: {
          categories,
          rewards: s.rewards
            .filter((r) => r.enabled && !r.deletedAt)
            .map(rewardView),
          leaderboard: ranked(s.students).map((p) => ({
            name:
              p.name.split(" ")[0] +
              " " +
              (p.name.split(" ")[1]?.slice(0, 1) || "") +
              ".",
            grade: p.grade,
            room: p.room,
            earned: p.earned,
            monthly: p.monthly,
          })),
          stats: s.stats,
          policy,
        },
      };
    }
    res.json(cachedPublic.data);
  });
  app.post("/api/lookup", async (req, res) => {
    await security.limit(req, "lookup", { limit: 120 });
    const { id } = parse(studentId, req.body);
    const p = (await store.read({ students: { ids: [id] } })).students[0];
    assert(
      p?.status === "Active",
      "ไม่พบรหัสนักเรียน หรือบัญชีไม่พร้อมใช้งาน",
      404,
    );
    res.json(publicStudent(p));
  });
  app.post("/api/identify", async (req, res) => {
    await security.limit(req, "identify", { limit: 60 });
    const { id } = parse(studentId, req.body);
    const p = (await store.read({ students: { ids: [id] } })).students[0];
    assert(
      p?.status === "Active",
      "ไม่พบรหัสนักเรียน หรือบัญชีไม่พร้อมใช้งาน",
      404,
    );
    await security.login(req, res, { role: "student", id });
    await audit(store, "login", { id, role: "student" }, "student");
    res.json(publicStudent(p));
  });
  app.post("/api/register", async (req, res) => {
    await security.limit(req, "register", { limit: 30 });
    const values = parse(registration, req.body);
    const p = await store.transact((s) => registerStudent(s, values), {
      students: {},
      audit: { limit: 0 },
    });
    await security.login(req, res, { role: "student", id: p.id });
    cachedPublic = null;
    res.status(201).json(publicStudent(p));
  });
  app.post("/api/login", async (req, res) => {
    const values = parse(staffLogin, req.body);
    await security.limit(req, "login", {
      account: values.id,
      limit: 30,
      window: 5 * 60000,
    });
    const p = (await store.read({ staff: { ids: [values.id] } })).staff[0];
    const valid = await verifyAsync(values.pin, p?.pin || dummyPin);
    if (!valid || !p || p.enabled === false) {
      await report(store, "STAFF_LOGIN_FAILED");
      throw new AppError("ชื่อบัญชีหรือ PIN ไม่ถูกต้อง", 401);
    }
    assert(
      !production || process.env.DEMO_MODE === "1" || p.id !== "teacher.mali",
      "กรุณาสร้างบัญชีเจ้าหน้าที่จริงก่อนใช้งาน",
    );
    assert(
      !production || process.env.DEMO_MODE === "1" || values.pin.length >= 8,
      "กรุณาให้ผู้ดูแลเปลี่ยน PIN เจ้าหน้าที่เป็นอย่างน้อย 8 หลัก",
    );
    await security.login(req, res, { ...p, role: "staff" });
    await audit(store, "login", p, "staff");
    res.json({ name: p.name });
  });
  app.post("/api/logout", async (req, res) => {
    const actor = await security.actor(req, { required: false });
    await security.logout(req, res);
    if (actor) await audit(store, "logout", actor, actor.role);
    res.json({ ok: true });
  });
  app.post("/api/session", async (req, res) => {
    await security.actor(req, { touch: true });
    res.json({ ok: true });
  });
  app.get("/api/student", async (req, res) => {
    const actor = await security.actor(req),
      id = actor.role === "staff" ? String(req.query.id || "") : actor.id;
    const s = await summary(store),
      p = s.students.find((x) => x.id === id);
    assert(p, "ไม่พบนักเรียน", 404);
    const page = Math.max(0, Math.min(100000, Number(req.query.page) || 0)),
      filter = {
        students: [id],
        limit: policy.pageSize + 1,
        offset: page * policy.pageSize,
      };
    const history = await store.read({
      ledger: filter,
      submissions: filter,
      redemptions: filter,
    });
    res.json({
      ...publicStudent(p),
      balance: p.balance,
      earned: p.earned,
      rank: ranked(s.students).findIndex((x) => x.id === id) + 1,
      page,
      hasMore: ["ledger", "submissions", "redemptions"].some(
        (k) => history[k].length > policy.pageSize,
      ),
      ledger: history.ledger.slice(0, policy.pageSize),
      submissions: history.submissions
        .slice(0, policy.pageSize)
        .map(submissionView),
      redemptions: history.redemptions.slice(0, policy.pageSize),
    });
  });
  app.get("/api/admin", async (req, res) => {
    const actor = await security.actor(req, { staff: true }),
      s = await summary(store);
    const tab = String(req.query.tab || "dashboard"),
      page = Math.max(0, Math.min(100000, Number(req.query.page) || 0)),
      query = String(req.query.q || "").slice(0, 100),
      filter = {
        limit: policy.pageSize + 1,
        offset: page * policy.pageSize,
        ...(query ? { query } : {}),
      };
    const scopes = {
      dashboard: { audit: { limit: 5 } },
      reviews: { submissions: { ...filter, status: "Pending" } },
      pickups: { redemptions: { ...filter, status: "Pending Pickup" } },
      ledger: { ledger: filter },
      audit: { audit: filter },
    };
    if (tab === "pickups" && query)
      scopes.pickups.redemptions.queryStudents = s.students
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
        .map((p) => p.id);
    const detail = await store.read(scopes[tab] || {}),
      kind = {
        reviews: "submissions",
        pickups: "redemptions",
        ledger: "ledger",
        audit: "audit",
      }[tab];
    const hasMore = kind ? detail[kind].length > policy.pageSize : false;
    if (kind) detail[kind] = detail[kind].slice(0, policy.pageSize);
    const health = {
      maintenance: await store.control("get", { id: "health:maintenance" }),
      error: await store.control("get", { id: "health:error" }),
      backup: await store.control("get", { id: "health:backup" }),
    };
    const students = s.students.map((p) => ({
      ...publicStudent(p),
      balance: p.balance,
    }));
    const filtered =
      tab === "students"
        ? students.filter((p) =>
            [p.name, p.id, "ม." + p.grade + "/" + p.room, p.grade, p.room]
              .join(" ")
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
        : students;
    res.json({
      students:
        tab === "students"
          ? filtered.slice(page * policy.pageSize, (page + 1) * policy.pageSize)
          : students,
      rewards: s.rewards.filter((r) => !r.deletedAt).map(rewardView),
      submissions: detail.submissions.map(submissionView),
      redemptions: detail.redemptions,
      ledger: detail.ledger,
      audit: detail.audit,
      name: actor.name,
      stats: s.stats,
      counts: s.counts,
      databaseBytes: s.databaseBytes || null,
      page,
      hasMore:
        tab === "students"
          ? (page + 1) * policy.pageSize < filtered.length
          : hasMore,
      drive: {
        configured: drive.configured,
        connected: await drive.connected(),
      },
      health,
    });
  });
  app.get("/api/promotion", async (req, res) => {
    await security.actor(req, { staff: true });
    const s = await store.read({
      students: {},
      meta: { ids: ["promotedYears"] },
    });
    res.json({
      students: s.students
        .filter((x) => x.status === "Active")
        .map(publicStudent),
      previewVersion: promotionVersion(s),
      year: schoolYear(),
      promotedYears: s.promotedYears,
    });
  });
  app.get("/api/rank", async (req, res) => {
    await security.limit(req, "rank", { limit: 120 });
    const s = await summary(store),
      q = String(req.query.q || "")
        .trim()
        .slice(0, 100);
    res.json(
      ranked(
        s.students.filter(
          (x) =>
            (!req.query.grade || x.grade === req.query.grade) &&
            (!req.query.room || x.room === req.query.room),
        ),
        req.query.period === "month",
      )
        .map((x, i) => ({ ...x, rank: i + 1 }))
        .filter((x) => q && (x.id === q || x.name.includes(q)))
        .map((x) => ({
          name: x.name.split(" ")[0],
          grade: x.grade,
          room: x.room,
          earned: req.query.period === "month" ? x.monthly : x.earned,
          rank: x.rank,
        })),
    );
  });
  app.get("/api/drive/status", async (req, res) => {
    await security.actor(req, { staff: true });
    res.json({
      configured: drive.configured,
      connected: await drive.connected(),
    });
  });
  app.get("/api/drive/connect", async (req, res) => {
    const actor = await security.actor(req, { staff: true });
    const binding = randomBytes(32).toString("hex");
    res.cookie("wb_oauth", binding, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/api/drive",
      maxAge: 600000,
    });
    res.redirect(await drive.authUrl(actor.id, binding));
  });
  app.get("/api/drive/callback", async (req, res) => {
    const binding = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("wb_oauth="))
      ?.slice(9);
    assert(binding && !req.query.error, "กรุณาเริ่มเชื่อม Google Drive ใหม่");
    const id = await drive.exchange(
      String(req.query.code || ""),
      String(req.query.state || ""),
      binding,
    );
    res.clearCookie("wb_oauth", { path: "/api/drive" });
    await audit(store, "driveConnected", { id }, "drive");
    res.redirect("/?drive=connected");
  });
  app.get("/api/media/:type/:id", async (req, res) => {
    const kind =
      req.params.type === "reward"
        ? "rewards"
        : req.params.type === "submission"
          ? "submissions"
          : null;
    assert(kind, "ไม่พบรูป", 404);
    const item = (await store.read({ [kind]: { ids: [req.params.id] } }))[
      kind
    ][0];
    assert(item, "ไม่พบรูป", 404);
    let ref;
    if (kind === "rewards") {
      if (!item.enabled) await security.actor(req, { staff: true });
      const index = Number(req.query.index || 0);
      assert(
        Number.isInteger(index) && index >= 0 && index < 5,
        "ไม่พบรูป",
        404,
      );
      ref = rewardImages(item)[index]?.src;
    } else {
      const actor = await security.actor(req);
      assert(
        actor.role === "staff" || item.student === actor.id,
        "ไม่มีสิทธิ์อ่านรูปนี้",
        403,
      );
      ref = item.image;
    }
    assert(ref?.startsWith("drive:"), "ไม่พบรูป", 404);
    const response = await drive.download(ref.slice(6));
    const mime = (response.headers.get("content-type") || "image/jpeg").split(
      ";",
    )[0];
    assert(
      ["image/jpeg", "image/png", "image/webp"].includes(mime),
      "ไฟล์ภาพไม่ถูกต้อง",
      502,
    );
    res.type(mime).send(Buffer.from(await response.arrayBuffer()));
  });
  app.post("/api/action", async (req, res) => {
    const actor = await security.actor(req, { touch: true });
    await security.limit(req, "action", { account: actor.id, limit: 120 });
    const body = actionBody(req.body);
    assert(
      !body.expectedStudent ||
        (actor.role === "student" && actor.id === body.expectedStudent),
      "บัญชีถูกเปลี่ยน กรุณากลับหน้าหลักและเข้าสู่ระบบใหม่",
      409,
    );
    if (body.action === "submit" || body.action === "reward")
      await security.limit(req, "images", { account: actor.id, limit: 30 });
    if (body.action === "deleteStudents")
      await security.limit(req, "confirmation", {
        account: actor.id,
        limit: 10,
        window: 300000,
      });
    const result = await performAction(store, drive, actor, body, {
      production,
    });
    cachedPublic = null;
    res.json(
      body.action === "deleteStudents"
        ? {
            deleted: result.deleted,
            imageCleanupPending: result.driveFiles.length,
          }
        : result,
    );
  });
  app.post("/api/maintenance", async (req, res) => {
    await security.actor(req, { staff: true });
    await security.limit(req, "maintenance", { limit: 2 });
    res.json(await maintenance(store, drive));
  });
  app.get("/api/cron/prune", async (req, res) => {
    assert(
      process.env.CRON_SECRET &&
        req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`,
      "ไม่มีสิทธิ์",
      401,
    );
    res.json(await maintenance(store, drive));
  });
  app.use("/api", (req, res) => res.status(404).json({ error: "ไม่พบ API" }));
  app.use(async (error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === "entity.parse.failed")
      return res
        .status(400)
        .json({ error: "รูปแบบคำขอไม่ถูกต้อง", code: "INVALID_JSON" });
    const known = error instanceof AppError,
      code = known
        ? error.code
        : error.type === "entity.too.large"
          ? "IMAGE_TOO_LARGE"
          : "SERVER_ERROR";
    if (!known || error.status >= 500) await report(store, code);
    if (error.retryAfter) res.set("Retry-After", String(error.retryAfter));
    res
      .status(
        known ? error.status : error.type === "entity.too.large" ? 413 : 500,
      )
      .json({
        error: known
          ? error.message
          : error.type === "entity.too.large"
            ? "รูปใหญ่เกินไป กรุณาลดจำนวนรูปหรือถ่ายใหม่"
            : "ระบบขัดข้อง กรุณาลองอีกครั้งหรือติดต่อเจ้าหน้าที่",
        code,
      });
  });
  return app;
}
