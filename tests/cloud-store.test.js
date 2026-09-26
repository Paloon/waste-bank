import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCloudStore } from "../server/cloud-store.js";
import { seed, act, balance } from "../server/store.js";
import { randomUUID } from "node:crypto";

test("PostgreSQL schema migration, scoped commits, races, summaries and distributed controls", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create table waste_bank_state(id integer primary key,version bigint not null default 0,value jsonb not null);",
    );
    const { s } = seed();
    await db.query("insert into waste_bank_state values(1,0,$1)", [
      JSON.stringify(s),
    ]);
    await db.exec(
      readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
    );
    await db.exec(
      readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
    ); // idempotent migration
    let forceConflict = false;
    const fetcher = async (url, options) => {
      const args = JSON.parse(options.body),
        fn = url.split("/").at(-1);
      let result;
      if (fn === "wb_snapshot")
        result = await db.query("select wb_snapshot($1) result", [args.scope]);
      else if (fn === "wb_commit") {
        if (forceConflict) {
          forceConflict = false;
          await db.query("update waste_bank_state set version=version+1");
          return Response.json(false);
        }
        result = await db.query("select wb_commit($1,$2) result", [
          args.expected_version,
          args.changes,
        ]);
      } else if (fn === "wb_control")
        result = await db.query("select wb_control($1,$2) result", [
          args.op,
          args.args,
        ]);
      else if (fn === "wb_summary")
        result = await db.query("select wb_summary() result");
      else throw Error(fn);
      return Response.json(result.rows[0].result);
    };
    const store = createCloudStore({
      url: "https://test.invalid",
      key: "test",
      fetcher,
    });
    assert.equal((await store.read()).ledger.length, s.ledger.length);
    assert.deepEqual(
      (await db.query("select value from waste_bank_state")).rows[0].value,
      {},
    );
    forceConflict = true;
    await store.transact(
      (next) => {
        next.rewards[0].name = "Changed";
      },
      { rewards: { ids: ["r1"] } },
    );
    assert.equal((await store.read()).ledger.length, s.ledger.length);
    assert.equal(
      (await store.read()).rewards.find((x) => x.id === "r1").name,
      "Changed",
    );
    await store.transact(
      (next) => {
        next.rewards.find((x) => x.id === "r2").stock = 1;
      },
      { rewards: { ids: ["r2"] } },
    );
    const actor = { role: "student", id: "65001" },
      scope = {
        students: { ids: [actor.id] },
        rewards: { ids: ["r2"] },
        ledger: { students: [actor.id] },
        requests: {},
        audit: { limit: 0 },
      };
    const spend = () =>
      store.transact(
        (next) =>
          act(next, actor, {
            action: "redeem",
            payload: { id: "r2" },
            key: randomUUID(),
          }),
        scope,
      );
    const outcomes = await Promise.allSettled([spend(), spend()]);
    assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
    const final = await store.read();
    assert.equal(final.rewards.find((x) => x.id === "r2").stock, 0);
    assert.equal(balance(final, actor.id), balance(s, actor.id) - 300);
    const totals = await store.summary();
    assert.equal(
      totals.students.find((x) => x.id === actor.id).balance,
      balance(final, actor.id),
    );
    const scopes = await store.read({
      ledger: { students: [actor.id], limit: 1 },
    });
    assert.equal(scopes.ledger.length, 1);
    assert.equal(scopes.students.length, 0);
    const rates = await Promise.all(
      Array.from({ length: 12 }, () =>
        store.control("rate", { id: "rate:shared", limit: 10, window: 60000 }),
      ),
    );
    assert.equal(rates.filter((x) => x.allowed).length, 10);
    await store.control("put", {
      id: "session:test",
      value: { expires: Date.now() + 50000, absolute: Date.now() + 100000 },
    });
    assert.ok(
      await store.control("touch", { id: "session:test", idle: 90000 }),
    );
    await store.control("delete", { id: "session:test" });
    assert.equal(
      await store.control("touch", { id: "session:test", idle: 90000 }),
      null,
    );
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from waste_bank_records"));
    await assert.rejects(db.query("select wb_snapshot(null)"));
    await db.exec("reset role");
    await db.exec("set role service_role");
    assert.ok(
      (await db.query("select wb_summary() as result")).rows[0].result.students
        .length > 0,
    );
    assert.equal(
      (await db.query("select wb_initialize($1) as result", [[]])).rows[0]
        .result,
      false,
    );
    await db.exec("reset role");
    await assert.rejects(
      db.query(
        "insert into waste_bank_records(kind,id,data) values('rewards','invalid','{\"stock\":-1,\"price\":1}')",
      ),
    );
  } finally {
    await db.close();
  }
});
