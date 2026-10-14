import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Avoid asynchronous WASM compilation in the Windows Node 23 test harness.
// Explicit local modules and bundle keep initialization independent of fetch.
export async function createTestDatabase() {
  const distribution = new URL(
    "./",
    import.meta.resolve("@electric-sql/pglite"),
  );
  const pgliteWasmModule = new WebAssembly.Module(
    readFileSync(new URL("pglite.wasm", distribution)),
  );
  const initdbWasmModule = new WebAssembly.Module(
    readFileSync(new URL("initdb.wasm", distribution)),
  );
  return PGlite.create({
    pgliteWasmModule,
    initdbWasmModule,
    fsBundle: new Blob([readFileSync(new URL("pglite.data", distribution))]),
  });
}
