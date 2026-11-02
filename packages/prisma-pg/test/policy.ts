/**
 * `filterable` / `sortable` policy and server-side limits (task 010) — attack
 * tests, the prisma-pg copy of drizzle-pg's `test/policy.ts` plus relation
 * filters. The delegates are spies: a refused request must never reach them.
 * Imported by `query.ts` (offline, in the gate); sets `process.exitCode` on failure.
 */
import { QueryKitError, type SkippedCondition } from "@querykitjs/core";

import { createRegistry } from "../src/index";
import { createTestClient } from "./prisma/client";

/** The policy is not built yet (phase 01): every mismatch is a todo, not a failure. */
const PENDING = true;

const prisma = createTestClient();

/** Every delegate method counts one call and answers with nothing. */
let delegateCalls = 0;
const spyDelegate = () =>
  new Proxy(
    {},
    {
      get: (_target, method: string) => async () => {
        delegateCalls++;
        return method === "count" ? 0 : method === "findFirst" ? null : method === "aggregate" ? {} : [];
      },
    },
  );
const spyClient = {
  _runtimeDataModel: (prisma as unknown as { _runtimeDataModel: unknown })._runtimeDataModel,
  user: spyDelegate(),
  post: spyDelegate(),
};

type Options = Record<string, unknown>;
const repositoryOf = (options: Options = {}, registryOptions: Options = {}) =>
  createRegistry(spyClient as never, registryOptions as never).repository("user" as never, options as never) as unknown as Record<
    string,
    (params?: unknown) => Promise<unknown>
  >;

interface Outcome {
  error?: QueryKitError;
  other?: unknown;
  calls: number;
}

async function attempt(run: () => Promise<unknown>): Promise<Outcome> {
  delegateCalls = 0;
  try {
    await run();
    return { calls: delegateCalls };
  } catch (error) {
    return error instanceof QueryKitError ? { error, calls: delegateCalls } : { other: error, calls: delegateCalls };
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
      : `ok (${outcome.calls} delegate calls)`;

function refused(label: string, outcome: Outcome, reason: string, site?: string) {
  const ok = outcome.error?.info.reason === reason && (site === undefined || outcome.error.info.site === site) && outcome.calls === 0;
  check(label, ok, describe(outcome));
}
function allowed(label: string, outcome: Outcome) {
  check(label, !outcome.error && !outcome.other && outcome.calls > 0, describe(outcome));
}

const secretProbe = [{ key: "secret", operation: "startsWith", value: "a" }];
const nameOnly = { filterable: { name: ["=", "in"] } };

/* A1 — K1 on a scalar field. */
refused(
  "A1 secret startsWith → forbidden-key, 0 delegate calls",
  await attempt(() => repositoryOf(nameOnly).findAll!({ filter: secretProbe })),
  "forbidden-key",
  "filter",
);

/* A2 — never dropped silently. */
const skipped: SkippedCondition[] = [];
refused(
  "A2 strict: false + onSkippedCondition → still forbidden-key",
  await attempt(() =>
    repositoryOf(nameOnly, { strict: false, onSkippedCondition: (info: SkippedCondition) => skipped.push(info) }).findList!({ filter: secretProbe }),
  ),
  "forbidden-key",
  "filter",
);
check("A2 no skip report", skipped.length === 0, `${skipped.length} reports`);
refused(
  "A2 name like → forbidden-operator",
  await attempt(() => repositoryOf(nameOnly).findAll!({ filter: [{ key: "name", operation: "like", value: "%a%" }] })),
  "forbidden-operator",
  "filter",
);

/* A3 — K1 through a relation filter key. */
refused(
  "A3 posts.secret (not in filterable) → forbidden-key",
  await attempt(() => repositoryOf(nameOnly).findAll!({ filter: [{ key: "posts.secret", operation: "=", value: "x" }] })),
  "forbidden-key",
  "filter",
);
const titleOpen = await attempt(() =>
  repositoryOf({ filterable: { name: ["="], "posts.title": ["="] } }, { strict: true }).findAll!({
    filter: [{ key: "posts.title", operation: "=", value: "x" }],
  }),
);
check("A3 posts.title in filterable → passes the policy (no forbidden-*)", !titleOpen.error?.info.reason.startsWith("forbidden"), describe(titleOpen));

/* A4 — Y5 sort, cursorKey, aggregate. */
const sortable = { ...nameOnly, sortable: ["id", "createdAt"] };
refused("A4 sort by secret → forbidden-key/sort", await attempt(() => repositoryOf(sortable).findAll!({ sort: [{ key: "secret" }] })), "forbidden-key", "sort");
allowed("A4 sort by createdAt → allowed", await attempt(() => repositoryOf(sortable).findAll!({ sort: [{ key: "createdAt", direction: "desc" }] })));
refused(
  "A4 cursorKey secret → forbidden-key/cursorKey",
  await attempt(() => repositoryOf(sortable).findCursor!({ cursorKey: "secret" })),
  "forbidden-key",
  "cursorKey",
);
refused(
  "A4 aggregate groupBy secret → forbidden-key/aggregate",
  await attempt(() => repositoryOf(nameOnly).aggregate!({ groupBy: ["secret"], count: true })),
  "forbidden-key",
  "aggregate",
);
refused(
  "A4 aggregate max(secret) → forbidden-key/aggregate",
  await attempt(() => repositoryOf(nameOnly).aggregate!({ max: "secret" })),
  "forbidden-key",
  "aggregate",
);
allowed("A4 aggregate groupBy name → allowed", await attempt(() => repositoryOf(nameOnly).aggregate!({ groupBy: ["name"], count: true })));

/* A5 — Y4 offset, straight to the repository. */
refused("A5 page 502 × 20 → limit-exceeded/page", await attempt(() => repositoryOf(nameOnly).findList!({ page: 502, perPage: 20 })), "limit-exceeded", "page");
allowed("A5 page 501 × 20 → allowed", await attempt(() => repositoryOf(nameOnly).findList!({ page: 501, perPage: 20 })));
refused(
  "A5 infinite offset 10 001 → limit-exceeded/page",
  await attempt(() => repositoryOf(nameOnly).findInfinite!({ offset: 10_001 })),
  "limit-exceeded",
  "page",
);
refused(
  "A5 registry limits: maxOffset 100, page 7 × 20 → limit-exceeded",
  await attempt(() => repositoryOf(nameOnly, { limits: { maxOffset: 100 } }).findList!({ page: 7, perPage: 20 })),
  "limit-exceeded",
  "page",
);

/* A6 — the same safe defaults as drizzle-pg (009 acceptance 7–8). */
const fromAllowed = { allowedColumns: ["id", "name"] };
allowed("A6 default allowedColumns: name = x → allowed", await attempt(() => repositoryOf(fromAllowed).findAll!({ filter: [{ key: "name", value: "x" }] })));
refused(
  "A6 default: name like → forbidden-operator",
  await attempt(() => repositoryOf(fromAllowed).findAll!({ filter: [{ key: "name", operation: "like", value: "%x%" }] })),
  "forbidden-operator",
  "filter",
);
refused(
  "A6 default: email = x → forbidden-key",
  await attempt(() => repositoryOf(fromAllowed).findAll!({ filter: [{ key: "email", value: "x" }] })),
  "forbidden-key",
  "filter",
);
allowed(
  "A6 default, no column options: id in [1,2] → allowed",
  await attempt(() => repositoryOf().findAll!({ filter: [{ key: "id", operation: "in", value: [1, 2] }] })),
);
refused(
  "A6 default, no column options: name = x → forbidden-key",
  await attempt(() => repositoryOf().findAll!({ filter: [{ key: "name", value: "x" }] })),
  "forbidden-key",
  "filter",
);
allowed("A6 default: created_at (@map) sorts like createdAt", await attempt(() => repositoryOf().findAll!({ sort: [{ key: "created_at" }] })));

/* Unknown keys keep unknown-key; findById's idKey is the server's. */
const unknown = await attempt(() => repositoryOf(nameOnly, { strict: true }).findAll!({ filter: [{ key: "nope", value: 1 }] }));
check("nope with strict → unknown-key", unknown.error?.info.reason === "unknown-key", describe(unknown));
allowed("findById with a policy that does not list id → allowed", await attempt(() => repositoryOf({ filterable: { name: ["="] } }).findById!(1 as never)));

console.log(`policy: ${passed} passed, ${failed} failed, ${todo} todo`);
if (failed > 0) process.exitCode = 1;
