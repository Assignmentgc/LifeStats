import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const build = mkdtempSync(path.join(tmpdir(), "lifestats-check-in-tests-"));
try {
  const compile = spawnSync(process.execPath, [
    fileURLToPath(import.meta.resolve("typescript/bin/tsc")), "--outDir", build, "--rootDir", ".",
    "--module", "commonjs", "--moduleResolution", "node", "--target", "ES2022",
    "--esModuleInterop", "--skipLibCheck", "--strict",
    "lib/check-in/analysis.ts", "lib/check-in/perplexity.ts", "lib/check-in/speech.ts", "lib/supabase/credentials.ts", "lib/user-name.ts",
  ], { stdio: "inherit" });
  if (compile.status !== 0) process.exitCode = compile.status ?? 1;
  else {
    const tests = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), "tests/check-in.test.mjs", "tests/check-in-db.test.mjs", "tests/check-in-route.test.mjs", "tests/check-in-form.test.mjs", "tests/check-in-views.test.mjs"], {
      stdio: "inherit", env: { ...process.env, CHECK_IN_BUILD_DIR: build },
    });
    process.exitCode = tests.status ?? 1;
  }
} finally {
  rmSync(build, { recursive: true, force: true });
}
