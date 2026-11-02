/**
 * Task 011 attack tests for @querykitjs/mongoose — **no database**. The policy
 * (K1 / Y5 / Y4, R19 raw), the LIKE wildcard limit, `startsWith` without the
 * `i` flag, and `maxTimeMS` on every read. `Query#exec` / `Aggregate#exec` of
 * the test model are spies: a refused request must never reach them.
 * Run from `conformance.ts` (its main block, in the gate); sets `process.exitCode`.
 */
import mongoose, { Schema, type Aggregate, type Query } from "mongoose";
import { QueryKitError, raw, type SkippedCondition } from "@querykitjs/core";

import { createRegistry } from "../src/index";

/** 011 is built: a mismatch fails. */
const PENDING = false;

const accountSchema = new Schema({
  status: { type: String, required: true },
  name: { type: String, required: true },
  secret: { type: String },
  age: { type: Number, default: null },
  createdAt: { type: Date, required: true },
});
const PolicyAccount = mongoose.model("PolicyAccount", accountSchema);

interface Sent {
  op: string;
  filter: Record<string, unknown>;
  options: Record<string, unknown>;
}
let sent: Sent[] = [];
/** When set, the next exec fails the way MongoDB fails a query past `maxTimeMS`. */
let failWithTimeout = false;

const timeoutError = () => Object.assign(new Error("operation exceeded time limit"), { name: "MongoServerError", code: 50, codeName: "MaxTimeMSExpired" });

const realExec = mongoose.Query.prototype.exec;
mongoose.Query.prototype.exec = async function exec(this: Query<unknown, unknown>) {
  if (this.model !== PolicyAccount) return realExec.call(this);
  const op = (this as unknown as { op?: string }).op ?? "";
  sent.push({ op, filter: this.getFilter() as Record<string, unknown>, options: this.getOptions() as Record<string, unknown> });
  if (failWithTimeout) throw timeoutError();
  return op === "countDocuments" ? 0 : op === "findOne" ? null : [];
} as typeof realExec;

const realAggregateExec = mongoose.Aggregate.prototype.exec;
mongoose.Aggregate.prototype.exec = async function exec(this: Aggregate<unknown>) {
  if ((this as unknown as { _model?: unknown })._model !== PolicyAccount) return realAggregateExec.call(this);
  sent.push({ op: "aggregate", filter: {}, options: this.options as Record<string, unknown> });
  if (failWithTimeout) throw timeoutError();
  return [];
} as typeof realAggregateExec;

type Options = Record<string, unknown>;
const repositoryOf = (options: Options = {}, registryOptions: Options = {}) =>
  createRegistry(mongoose.connection, registryOptions as never).repository(PolicyAccount, options as never) as unknown as Record<
    string,
    (params?: unknown) => Promise<unknown>
  >;

interface Outcome {
  error?: Error;
  calls: number;
}
async function attempt(run: () => Promise<unknown>): Promise<Outcome> {
  sent = [];
  try {
    await run();
    return { calls: sent.length };
  } catch (error) {
    return { error: error as Error, calls: sent.length };
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
const describe = (o: Outcome) =>
  o.error instanceof QueryKitError
    ? `${o.error.info.reason}/${o.error.info.site}`
    : o.error
      ? `threw ${o.error.name}: ${o.error.message}`
      : `ok (${o.calls} exec calls)`;
function refused(label: string, o: Outcome, reason: string, site?: string) {
  const ok = o.error instanceof QueryKitError && o.error.info.reason === reason && (site === undefined || o.error.info.site === site) && o.calls === 0;
  check(label, ok, describe(o));
}
function allowed(label: string, o: Outcome) {
  check(label, !o.error && o.calls > 0, describe(o));
}

const statusOnly = { filterable: { status: ["=", "in"] } };
const secretProbe = [{ key: "secret", operation: "startsWith", value: "a" }];

/* A1 — K1, also with strict off and a hook. */
refused(
  "A1 secret startsWith → forbidden-key, 0 exec",
  await attempt(() => repositoryOf(statusOnly).findAll!({ filter: secretProbe })),
  "forbidden-key",
  "filter",
);
const skipped: SkippedCondition[] = [];
refused(
  "A1 strict: false + onSkippedCondition → still forbidden-key",
  await attempt(() =>
    repositoryOf(statusOnly, { strict: false, onSkippedCondition: (i: SkippedCondition) => skipped.push(i) }).findList!({ filter: secretProbe }),
  ),
  "forbidden-key",
  "filter",
);

/* A1a — R19: unbranded driver objects from JSON are refused; raw() passes. */
for (const json of ['{ "$where": "sleep(1000)" }', '{ "secret": { "$regex": "^a" } }', '{ "$expr": { "$gt": ["$age", 1] } }']) {
  refused(
    `A1a JSON ${json} → forbidden-key, 0 exec`,
    await attempt(() => repositoryOf({ filterable: { secret: "*", age: "*" } }).findAll!({ filter: JSON.parse(json) })),
    "forbidden-key",
    "filter",
  );
}
allowed("A1a raw({ age: { $gt: 1 } }) → passes (server code)", await attempt(() => repositoryOf(statusOnly).findAll!({ filter: raw({ age: { $gt: 1 } }) })));

/* A2 — Y5 sort, cursorKey, aggregate. */
const sortable = { ...statusOnly, sortable: ["_id", "createdAt"] };
refused("A2 sort by secret → forbidden-key/sort", await attempt(() => repositoryOf(sortable).findAll!({ sort: [{ key: "secret" }] })), "forbidden-key", "sort");
refused(
  "A2 cursorKey secret → forbidden-key/cursorKey",
  await attempt(() => repositoryOf(sortable).findCursor!({ cursorKey: "secret" })),
  "forbidden-key",
  "cursorKey",
);
refused(
  "A2 aggregate groupBy secret → forbidden-key/aggregate",
  await attempt(() => repositoryOf(statusOnly).aggregate!({ groupBy: ["secret"], count: true })),
  "forbidden-key",
  "aggregate",
);
allowed("A2 sort by createdAt → allowed", await attempt(() => repositoryOf(sortable).findAll!({ sort: [{ key: "createdAt" }] })));

/* A3 — Y4 offset. */
refused(
  "A3 page 502 × 20 → limit-exceeded/page",
  await attempt(() => repositoryOf(statusOnly).findList!({ page: 502, perPage: 20 })),
  "limit-exceeded",
  "page",
);
allowed("A3 page 501 × 20 → allowed", await attempt(() => repositoryOf(statusOnly).findList!({ page: 501, perPage: 20 })));

/* A4 / A5 — LIKE wildcards and the regex it compiles to. */
const likeOpen = { filterable: { name: "*" } };
refused(
  "A4 like '%a%a%b' (3 wildcards) → limit-exceeded/filter",
  await attempt(() => repositoryOf(likeOpen).findAll!({ filter: [{ key: "name", operation: "like", value: "%a%a%b" }] })),
  "limit-exceeded",
  "filter",
);
const collapsed = await attempt(() => repositoryOf(likeOpen).findAll!({ filter: [{ key: "name", operation: "like", value: "%%a%" }] }));
check(
  "A4 like '%%a%' collapses to '%a%' and passes",
  !collapsed.error && JSON.stringify(sent[0]?.filter.name) === JSON.stringify({ $regex: "^.*a.*$" }),
  describe(collapsed) + " " + JSON.stringify(sent[0]?.filter),
);
await attempt(() => repositoryOf(likeOpen).findAll!({ filter: [{ key: "name", operation: "like", value: "a.b%" }] }));
check(
  "A5 like 'a.b%' → ^a\\.b.*$ (escaping kept)",
  JSON.stringify(sent[0]?.filter.name) === JSON.stringify({ $regex: "^a\\.b.*$" }),
  JSON.stringify(sent[0]?.filter),
);

/* A6 / A7 — maxTimeMS on every read; a timeout becomes QueryKitTimeoutError. */
await attempt(() => repositoryOf(statusOnly).findList!({ page: 1 }));
check(
  "A6 find and countDocuments carry maxTimeMS 2000",
  sent.length === 2 && sent.every(s => s.options.maxTimeMS === 2000),
  JSON.stringify(sent.map(s => [s.op, s.options.maxTimeMS])),
);
await attempt(() => repositoryOf(statusOnly).aggregate!({ groupBy: ["status"], count: true }));
check("A6 aggregate carries maxTimeMS 2000", sent[0]?.options.maxTimeMS === 2000, JSON.stringify(sent[0]?.options));
await attempt(() => repositoryOf({ ...statusOnly, maxTimeMS: 500 }).findAll!({}));
check("A6 repository maxTimeMS 500 wins", sent[0]?.options.maxTimeMS === 500, JSON.stringify(sent[0]?.options));
failWithTimeout = true;
const timedOut = await attempt(() => repositoryOf(statusOnly).findAll!({}));
failWithTimeout = false;
check(
  "A7 MaxTimeMSExpired → QueryKitTimeoutError, code QUERYKIT_TIMEOUT",
  timedOut.error?.name === "QueryKitTimeoutError" && (timedOut.error as { code?: string }).code === "QUERYKIT_TIMEOUT",
  describe(timedOut),
);

/* A8 — contains is closed by default, open when listed. */
refused(
  "A8 default: contains → forbidden-operator",
  await attempt(() => repositoryOf({ allowedColumns: ["name"] }).findAll!({ filter: [{ key: "name", operation: "contains", value: "a" }] })),
  "forbidden-operator",
  "filter",
);
allowed(
  "A8 filterable name: [contains] → allowed",
  await attempt(() => repositoryOf({ filterable: { name: ["contains"] } }).findAll!({ filter: [{ key: "name", operation: "contains", value: "a" }] })),
);

/* A9 — startsWith anchored and escaped, case-insensitive like every adapter (R11; thinker dropped Locked 4's case part). */
await attempt(() => repositoryOf({ filterable: { name: ["startsWith"] } }).findAll!({ filter: [{ key: "name", operation: "startsWith", value: "Al" }] }));
check(
  "A9 startsWith 'Al' → { $regex: '^Al', $options: 'i' }",
  JSON.stringify(sent[0]?.filter.name) === JSON.stringify({ $regex: "^Al", $options: "i" }),
  JSON.stringify(sent[0]?.filter),
);

/* Unknown keys keep unknown-key. */
const unknown = await attempt(() => repositoryOf(statusOnly, { strict: true }).findAll!({ filter: [{ key: "nope", value: 1 }] }));
check("nope with strict → unknown-key", unknown.error instanceof QueryKitError && unknown.error.info.reason === "unknown-key", describe(unknown));

console.log(`policy: ${passed} passed, ${failed} failed, ${todo} todo`);
if (failed > 0) process.exitCode = 1;
