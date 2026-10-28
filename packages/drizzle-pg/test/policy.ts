/**
 * `filterable` / `sortable` policy and server-side limits (task 009) — attack
 * tests. The executor is a spy: a refused request must never reach it.
 * Imported by `sql.ts` (offline, in the gate); sets `process.exitCode` on failure.
 */
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { QueryKitError, type SkippedCondition } from "@querykitjs/core";

import { createRegistry } from "../src/index";
import type { AnyDb } from "../src/types";

/** The policy is built: a mismatch fails. */
const PENDING = false;

const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  status: text("status").notNull(),
  name: text("name").notNull(),
  secret: text("secret").notNull(),
  amount: integer("amount"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
const schema = { accounts };

/** Every executor entry point counts one call and answers with nothing. */
let executorCalls = 0;
const countQuery = () => ({
  where: () => countQuery(),
  groupBy: () => countQuery(),
  $dynamic: () => countQuery(),
  then: (resolve: (rows: unknown[]) => void) => {
    executorCalls++;
    resolve([{ value: 0 }]);
  },
});
const spyDb = {
  query: {
    accounts: {
      findMany: async () => (executorCalls++, []),
      findFirst: async () => (executorCalls++, undefined),
    },
  },
  select: () => ({ from: () => countQuery() }),
} as unknown as AnyDb;

type Options = Record<string, unknown>;
const repositoryOf = (options: Options = {}, registryOptions: Options = {}) =>
  createRegistry(spyDb, schema, registryOptions as never).repository(accounts, options as never) as unknown as Record<
    string,
    (params?: unknown) => Promise<unknown>
  >;

interface Outcome {
  error?: QueryKitError;
  other?: unknown;
  calls: number;
}

async function attempt(run: () => Promise<unknown>): Promise<Outcome> {
  executorCalls = 0;
  try {
    await run();
    return { calls: executorCalls };
  } catch (error) {
    return error instanceof QueryKitError ? { error, calls: executorCalls } : { other: error, calls: executorCalls };
  }
}

let passed = 0;
let failed = 0;
let todo = 0;
function check(label: string, ok: boolean, extra = "") {
  if (ok) {
    passed++;
    console.log(`✅ ${label}`);
  } else if (PENDING) {
    todo++;
    console.log(`⏳ todo ${label}${extra ? ` — ${extra}` : ""}`);
  } else {
    failed++;
    console.log(`❌ ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

const describe = (outcome: Outcome) =>
  outcome.error
    ? `${outcome.error.info.reason}/${outcome.error.info.site}`
    : outcome.other
      ? `threw ${String(outcome.other)}`
      : `ok (${outcome.calls} executor calls)`;

/** Refused with this reason (and site), and the executor never ran. */
function refused(label: string, outcome: Outcome, reason: string, site?: string) {
  const ok = outcome.error?.info.reason === reason && (site === undefined || outcome.error.info.site === site) && outcome.calls === 0;
  check(label, ok, describe(outcome));
}
function allowed(label: string, outcome: Outcome) {
  check(label, !outcome.error && !outcome.other && outcome.calls > 0, describe(outcome));
}

const secretProbe = [{ key: "secret", operation: "startsWith", value: "a" }];
const statusOnly = { filterable: { status: ["=", "in"] } };

/* A1 — K1: a field outside `filterable` is refused before SQL runs. */
refused(
  "A1 secret startsWith → forbidden-key, 0 executor calls",
  await attempt(() => repositoryOf(statusOnly).findAll!({ filter: secretProbe })),
  "forbidden-key",
  "filter",
);

/* A2 — never dropped silently, whatever strict / onSkippedCondition say. */
const skipped: SkippedCondition[] = [];
refused(
  "A2 strict: false + onSkippedCondition → still forbidden-key",
  await attempt(() =>
    repositoryOf(statusOnly, { strict: false, onSkippedCondition: (info: SkippedCondition) => skipped.push(info) }).findList!({ filter: secretProbe }),
  ),
  "forbidden-key",
  "filter",
);
check("A2 the hook is not used as a way out (no skip report)", skipped.length === 0, `${skipped.length} reports`);

/* A3 — an operator outside the field's list. */
refused(
  "A3 status like → forbidden-operator",
  await attempt(() => repositoryOf(statusOnly).findAll!({ filter: [{ key: "status", operation: "like", value: "%a%" }] })),
  "forbidden-operator",
  "filter",
);
allowed("A3 status in → allowed", await attempt(() => repositoryOf(statusOnly).findAll!({ filter: [{ key: "status", operation: "in", value: ["a"] }] })));
refused(
  "A3 nested: forbidden key inside or/not is found",
  await attempt(() => repositoryOf(statusOnly).findAll!({ filter: { or: [{ key: "status", value: "a" }, { not: { key: "secret", value: "x" } }] } })),
  "forbidden-key",
  "filter",
);

/* A4 — Y5: sort and cursorKey outside `sortable`. */
const sortable = { ...statusOnly, sortable: ["id", "createdAt"] };
refused("A4 sort by secret → forbidden-key/sort", await attempt(() => repositoryOf(sortable).findAll!({ sort: [{ key: "secret" }] })), "forbidden-key", "sort");
allowed("A4 sort by createdAt → allowed", await attempt(() => repositoryOf(sortable).findAll!({ sort: [{ key: "createdAt", direction: "desc" }] })));
refused(
  "A4 cursorKey secret → forbidden-key/cursorKey",
  await attempt(() => repositoryOf(sortable).findCursor!({ cursorKey: "secret" })),
  "forbidden-key",
  "cursorKey",
);

/* A5 — Y4: offset past maxOffset, straight to the repository (no validator). */
refused(
  "A5 page 502 × 20 → limit-exceeded/page",
  await attempt(() => repositoryOf(statusOnly).findList!({ page: 502, perPage: 20 })),
  "limit-exceeded",
  "page",
);
allowed("A5 page 501 × 20 → allowed", await attempt(() => repositoryOf(statusOnly).findList!({ page: 501, perPage: 20 })));
refused(
  "A5 infinite offset 10 001 → limit-exceeded/page",
  await attempt(() => repositoryOf(statusOnly).findInfinite!({ offset: 10_001 })),
  "limit-exceeded",
  "page",
);
refused(
  "A5 repository limits override: maxOffset 100, page 7 × 20 → limit-exceeded",
  await attempt(() => repositoryOf({ ...statusOnly, limits: { maxOffset: 100 } }).findList!({ page: 7, perPage: 20 })),
  "limit-exceeded",
  "page",
);
refused(
  "A5 server-side filter limit: in with 201 items → limit-exceeded/filter",
  await attempt(() =>
    repositoryOf(statusOnly).findAll!({ filter: [{ key: "status", operation: "in", value: Array.from({ length: 201 }, (_, i) => `s${i}`) }] }),
  ),
  "limit-exceeded",
  "filter",
);
refused(
  "A5 server-side sort limit: 4 fields → limit-exceeded/sort",
  await attempt(() =>
    repositoryOf({ filterable: { status: "*" }, sortable: ["id", "status", "name", "createdAt"] }).findAll!({
      sort: ["id", "status", "name", "createdAt"].map(key => ({ key })),
    }),
  ),
  "limit-exceeded",
  "sort",
);

/* A6 — K1 through aggregate. */
refused(
  "A6 aggregate groupBy secret → forbidden-key/aggregate",
  await attempt(() => repositoryOf(statusOnly).aggregate!({ groupBy: ["secret"], count: true })),
  "forbidden-key",
  "aggregate",
);
refused(
  "A6 aggregate min(secret) → forbidden-key/aggregate",
  await attempt(() => repositoryOf(statusOnly).aggregate!({ min: "secret" })),
  "forbidden-key",
  "aggregate",
);
refused(
  "A6 aggregate where secret → forbidden-key/filter",
  await attempt(() => repositoryOf(statusOnly).aggregate!({ filter: secretProbe, count: true })),
  "forbidden-key",
  "filter",
);
allowed("A6 aggregate groupBy status → allowed", await attempt(() => repositoryOf(statusOnly).aggregate!({ groupBy: ["status"], count: true })));

/* A7 — safe default from allowedColumns: equality only. */
const fromAllowed = { allowedColumns: ["id", "status"] };
allowed("A7 default: status = x → allowed", await attempt(() => repositoryOf(fromAllowed).findAll!({ filter: [{ key: "status", value: "x" }] })));
refused(
  "A7 default: status like → forbidden-operator",
  await attempt(() => repositoryOf(fromAllowed).findAll!({ filter: [{ key: "status", operation: "like", value: "%x%" }] })),
  "forbidden-operator",
  "filter",
);
refused(
  "A7 default: name = x → forbidden-key",
  await attempt(() => repositoryOf(fromAllowed).findAll!({ filter: [{ key: "name", value: "x" }] })),
  "forbidden-key",
  "filter",
);
allowed(
  "A7 default: eq alias of = → allowed",
  await attempt(() => repositoryOf(fromAllowed).findAll!({ filter: [{ key: "status", operation: "eq", value: "x" }] })),
);

/* A8 — no allowedColumns, no forcedColumns: the primary key only. */
allowed("A8 default: id = 1 → allowed", await attempt(() => repositoryOf().findAll!({ filter: [{ key: "id", value: 1 }] })));
allowed("A8 default: id in [1,2] → allowed", await attempt(() => repositoryOf().findAll!({ filter: [{ key: "id", operation: "in", value: [1, 2] }] })));
refused(
  "A8 default: status = x → forbidden-key",
  await attempt(() => repositoryOf().findAll!({ filter: [{ key: "status", value: "x" }] })),
  "forbidden-key",
  "filter",
);
refused(
  "A8 default: sort by secret → forbidden-key/sort",
  await attempt(() => repositoryOf().findAll!({ sort: [{ key: "secret" }] })),
  "forbidden-key",
  "sort",
);
allowed("A8 default: sort by createdAt → allowed", await attempt(() => repositoryOf().findAll!({ sort: [{ key: "createdAt" }] })));
allowed(
  "A8 default: forcedColumns keys are filterable",
  await attempt(() => repositoryOf({ forcedColumns: { id: true, name: true } }).findAll!({ filter: [{ key: "name", value: "x" }] })),
);

/* A9 — a key the table does not have keeps the old unknown-key behaviour. */
const unknown = await attempt(() => repositoryOf(statusOnly, { strict: true }).findAll!({ filter: [{ key: "nope", value: 1 }] }));
check("A9 nope with strict → unknown-key", unknown.error?.info.reason === "unknown-key", describe(unknown));
const quietSkips: SkippedCondition[] = [];
const quiet = await attempt(() =>
  repositoryOf(statusOnly, { onSkippedCondition: (info: SkippedCondition) => quietSkips.push(info) }).findAll!({ filter: [{ key: "nope", value: 1 }] }),
);
check("A9 nope without strict → skipped and reported, query runs", !quiet.error && quiet.calls > 0 && quietSkips[0]?.reason === "unknown-key", describe(quiet));

/* findById: the server's own idKey is not the client's filter. */
allowed("findById with a policy that does not list id → allowed", await attempt(() => repositoryOf({ filterable: { status: ["="] } }).findById!(1 as never)));

console.log(`policy: ${passed} passed, ${failed} failed, ${todo} todo`);
if (failed > 0) process.exitCode = 1;
