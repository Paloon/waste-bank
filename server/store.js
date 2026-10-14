import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { emptyState, selectState } from "./state.js";
import { controlValue } from "./control.js";
import { seed, fail } from "./domain.js";
// Preserve existing imports while keeping domain rules independent of SQLite.
export {
  hash,
  verify,
  categories,
  balance,
  earned,
  fail,
  seed,
  studentView,
  registerStudent,
  act,
} from "./domain.js";

export function createStore(
  directory,
  {
    demo = process.env.DEMO_MODE === "1" ||
      (process.env.NODE_ENV !== "production" && !process.env.VERCEL),
  } = {},
) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, "eco.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)",
  );
  if (!db.prepare("SELECT id FROM state").get()) {
    const { s, staffPin } = demo ? seed() : { s: emptyState() };
    db.prepare("INSERT INTO state VALUES(1,?)").run(JSON.stringify(s));
    if (demo)
      writeFileSync(
        join(directory, "demo-credentials.txt"),
        `DEMO ONLY — ไม่ใช้ข้อมูลนักเรียนจริง\nStaff: teacher.mali\nPIN: ${staffPin}\nStudent: 65001 (no PIN)\n`,
        { mode: 0o600 },
      );
  } else {
    const s = JSON.parse(
      db.prepare("SELECT value FROM state WHERE id=1").get().value,
    );
    let changed = false;
    for (const student of s.students) {
      if ("pin" in student) {
        delete student.pin;
        changed = true;
      }
      if (!student.number && /^650(0[1-9]|1[0-2])$/.test(student.id)) {
        student.number = Number(student.id) - 65000;
        changed = true;
      }
    }
    if (changed) {
      db.prepare("UPDATE state SET value=? WHERE id=1").run(JSON.stringify(s));
      const credentials = join(directory, "demo-credentials.txt");
      if (existsSync(credentials)) {
        const old = readFileSync(credentials, "utf8");
        writeFileSync(
          credentials,
          old.replace(
            /^Student:.*\r?\n(?:Students .*\r?\n)?/m,
            "Student: 65001 (no PIN)\n",
          ),
        );
      }
    }
  }
  db.exec(
    "CREATE TABLE IF NOT EXISTS controls (id TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS controls_expiry ON controls(expires); PRAGMA busy_timeout=5000",
  );
  return {
    read: (scope) => ({
      ...emptyState(),
      ...selectState(
        {
          ...emptyState(),
          ...JSON.parse(
            db.prepare("SELECT value FROM state WHERE id=1").get().value,
          ),
        },
        scope,
      ),
    }),
    transact(fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        let s = this.read();
        let result = fn(s);
        fail(!result?.then, "Transaction callback must be synchronous");
        db.prepare("UPDATE state SET value=? WHERE id=1").run(
          JSON.stringify(s),
        );
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    control(op, args = {}) {
      db.exec("BEGIN IMMEDIATE");
      try {
        let result;
        if (op === "prune") {
          db.prepare("DELETE FROM controls WHERE expires <= ?").run(Date.now());
          result = true;
        } else {
          const row = db
            .prepare("SELECT value FROM controls WHERE id=?")
            .get(args.id);
          const out = controlValue(
            op,
            row ? JSON.parse(row.value) : null,
            args,
          );
          if (out.remove)
            db.prepare("DELETE FROM controls WHERE id=?").run(args.id);
          if (out.save)
            db.prepare(
              "INSERT INTO controls VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,expires=excluded.expires",
            ).run(args.id, JSON.stringify(out.save), out.save.expires);
          result = out.value;
        }
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => db.close(),
  };
}
