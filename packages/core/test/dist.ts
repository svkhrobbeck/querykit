/**
 * The built entries (task 009, `minify: true`): `QueryKitError` keeps its name and
 * class identity across `.` and `./internal`, in ESM and in CJS. Skipped when
 * `dist/` is not built. Imported by `internal.ts`; sets `process.exitCode` on failure.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

type Entry = {
  QueryKitError: new (...args: never[]) => Error;
  QueryKitTimeoutError: new (source: string, ms: number) => Error;
  resolvePolicy?: (options: unknown) => { checkPage(page: unknown): void };
};

const dist = (file: string) => fileURLToPath(new URL(`../dist/${file}`, import.meta.url));

let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failed++;
}

/** The error the internal entry throws, caught as the main entry's class. */
function thrownBy(internal: Entry): unknown {
  const policy = internal.resolvePolicy!({ source: "t", fieldOf: (key: string) => key, primaryKey: "id" });
  try {
    policy.checkPage({ offset: 10_001 });
  } catch (error) {
    return error;
  }
  return undefined;
}

if (existsSync(dist("index.js")) && existsSync(dist("index.cjs"))) {
  const esmMain = (await import(dist("index.js"))) as Entry;
  const esmInternal = (await import(dist("internal.js"))) as Entry;
  const require = createRequire(import.meta.url);
  const cjsMain = require(dist("index.cjs")) as Entry;
  const cjsInternal = require(dist("internal.cjs")) as Entry;

  for (const [format, main, internal] of [
    ["esm", esmMain, esmInternal],
    ["cjs", cjsMain, cjsInternal],
  ] as const) {
    const error = thrownBy(internal);
    check(`dist ${format}: ./internal throws the main entry's QueryKitError (instanceof)`, error instanceof main.QueryKitError);
    check(
      `dist ${format}: QueryKitError.name survives the build`,
      (error as Error | undefined)?.name === "QueryKitError" && main.QueryKitError.name === "QueryKitError",
    );
    /* Task 016: no keepNames — every exported error class sets `this.name` itself. */
    const timeout = new main.QueryKitTimeoutError("users", 1);
    check(
      `dist ${format}: QueryKitTimeoutError.name survives the build`,
      timeout.name === "QueryKitTimeoutError" && main.QueryKitTimeoutError.name === "QueryKitTimeoutError" && timeout instanceof Error,
    );
  }
} else {
  console.log("⏭️  core dist/ not built — skipping the built-entry checks (run `bun run build` to include them)");
}

if (failed > 0) process.exitCode = 1;
