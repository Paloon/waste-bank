import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test(
  "Windows scheduled runner tolerates stderr warnings and propagates real failures",
  { skip: process.platform !== "win32" },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "wb-scheduled-runner-"));
    try {
      await mkdir(join(root, "scripts"));
      const runner = join(root, "scripts", "backup-task.ps1"),
        script = join(root, "scripts", "backup.mjs"),
        envFile = join(root, "fixture.env");
      await copyFile(
        new URL("../scripts/backup-task.ps1", import.meta.url),
        runner,
      );
      await writeFile(envFile, "FIXTURE=1\n");
      const powershell = join(
        process.env.SystemRoot,
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );
      const args = [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        runner,
        "-EnvFile",
        envFile,
        "-NodePath",
        process.execPath,
      ];
      await writeFile(
        script,
        'console.error("safe warning"); console.log("backup verified");',
      );
      await promisify(execFile)(powershell, args, { windowsHide: true });
      assert.match(
        await readFile(join(root, "scheduled.backup.log"), "utf8"),
        /backup verified/,
      );
      assert.match(
        await readFile(join(root, "scheduled.backup.errors.log"), "utf8"),
        /safe warning/,
      );
      await writeFile(
        script,
        'console.error("safe failure"); process.exitCode=7;',
      );
      await assert.rejects(
        promisify(execFile)(powershell, args, { windowsHide: true }),
        (error) => error.code === 7,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
