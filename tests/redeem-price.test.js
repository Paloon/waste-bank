import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createStore, balance } from "../server/store.js";
import { performAction } from "../server/actions.js";
import { actionBody } from "../server/validation.js";
import {
  clearPendingKey,
  loadPendingKey,
  savePendingKey,
} from "../src/pendingRequest.js";

const student = { role: "student", id: "65001" };
const fixture = () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-price-"));
  return { dir, store: createStore(dir, { demo: true }) };
};
const redeem = (payload, key = Date.now() + ":" + randomUUID()) =>
  actionBody({ action: "redeem", payload, key });
const run = (store, body) => performAction(store, {}, student, body);
const currentBalance = (store) => balance(store.read(), student.id);

test("redeem charges only the price the student confirmed", async () => {
  const { dir, store } = fixture();
  try {
    const before = currentBalance(store);
    await store.transact((s) => {
      s.rewards.find((r) => r.id === "r1").price = 200;
    });
    await assert.rejects(
      run(store, redeem({ id: "r1", price: 150 })),
      (error) => error.code === "PRICE_CHANGED" && /200/.test(error.message),
    );
    assert.equal(currentBalance(store), before, "nothing charged on refusal");
    await run(store, redeem({ id: "r1", price: 200 }));
    assert.equal(currentBalance(store), before - 200);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a retry after a price change replays the receipt and never charges twice", async () => {
  const { dir, store } = fixture();
  try {
    const before = currentBalance(store);
    const key = Date.now() + ":" + randomUUID();
    const first = await run(store, redeem({ id: "r1", price: 150 }, key));
    await store.transact((s) => {
      s.rewards.find((r) => r.id === "r1").price = 200;
    });
    // The reply to the first request was lost; the retry reuses the key but now
    // carries the new on-screen price.
    const retry = await run(store, redeem({ id: "r1", price: 200 }, key));
    assert.deepEqual(retry, first);
    assert.equal(currentBalance(store), before - 150);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a client without the price field still redeems", async () => {
  const { dir, store } = fixture();
  try {
    const before = currentBalance(store);
    await run(store, redeem({ id: "r1" }));
    assert.equal(currentBalance(store), before - 150);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pending request key survives only for the same request and for a short time", () => {
  const data = new Map();
  const store = {
    getItem: (name) => data.get(name) ?? null,
    setItem: (name, value) => data.set(name, value),
    removeItem: (name) => data.delete(name),
  };
  const signature = '{"action":"redeem","id":"r1","student":"65001"}';
  assert.equal(loadPendingKey(signature, 1000, store), null);
  savePendingKey(signature, "1:abc", 1000, store);
  assert.equal(loadPendingKey(signature, 2000, store), "1:abc");
  assert.equal(
    loadPendingKey(signature.replace("r1", "r2"), 2000, store),
    null,
    "another reward is a new request",
  );
  assert.equal(
    loadPendingKey(signature, 1000 + 31 * 60 * 1000, store),
    null,
    "an old key is dropped",
  );
  clearPendingKey(store);
  assert.equal(loadPendingKey(signature, 2000, store), null);
  assert.equal(
    loadPendingKey(signature, 2000, null),
    null,
    "no storage is fine",
  );
});
