/**
 * Conformance runner for @querykitjs/mongoose — **no database, no connection**.
 *
 *   bun --preload ./packages/mongoose/test/bun-v8-shim.ts packages/mongoose/test/conformance.ts
 *
 * The real repository builds real mongoose queries; `Query.prototype.exec` is
 * replaced for the fixture model: the filter is cast by mongoose itself
 * (`query.cast()`, the schema's casting) and evaluated by `fake-mongo.ts` on
 * the shared fixture rows. `mongoose.connect` throws if anything calls it.
 */
import mongoose, { Schema, Types, type Query } from "mongoose";

import type { Call, CaseOptions } from "../../core/test/conformance/cases";
import { cloneRows, recordCall, writeRows, type ConformanceRow } from "../../core/test/conformance/fixtures";
import { callArgs, toResult } from "../../core/test/conformance/harness-util";
import { runConformance, type Harness } from "../../core/test/conformance/runner";
import { createRegistry } from "../src/index";

import { find, matches, type FindOptions } from "./fake-mongo";

let connectCalls = 0;
mongoose.connect = (() => {
  connectCalls++;
  throw new Error("conformance: mongoose.connect must not be called");
}) as typeof mongoose.connect;

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  age: { type: Number, default: null },
  createdAt: { type: Date, required: true },
});
const ConformanceUser = mongoose.model("ConformanceUser", userSchema);

/** Fixture rows as documents: `_id` is an ObjectId derived from the numeric id. */
const documents = () => cloneRows().map(({ id, ...rest }) => ({ _id: new Types.ObjectId(id.toString(16).padStart(24, "0")), ...rest }));

/** Documents back to fixture rows (`_id` → numeric `id`). */
const toRows = (docs: readonly Record<string, unknown>[]): ConformanceRow[] =>
  docs.map(({ _id, ...rest }) => ({ id: Number.parseInt(String(_id), 16), ...rest }) as ConformanceRow);

/** `updateMany` / `deleteMany` on the case's rows (task 013). */
function write(kind: "update" | "delete", filter: Record<string, unknown>, update: Record<string, unknown> = {}) {
  recordCall("write");
  const docs = documents();
  const hit = new Set(docs.filter(doc => matches(filter, doc)).map(doc => String(doc._id)));
  const patch = (update.$set as Record<string, unknown> | undefined) ?? update;
  const kept = kind === "update" ? docs.map(doc => (hit.has(String(doc._id)) ? { ...doc, ...patch } : doc)) : docs.filter(doc => !hit.has(String(doc._id)));
  writeRows(toRows(kept));
  return hit.size;
}

const realExec = mongoose.Query.prototype.exec;
mongoose.Query.prototype.exec = async function exec(this: Query<unknown, unknown>) {
  if (this.model !== ConformanceUser) return realExec.call(this);
  const filter = this.cast(ConformanceUser) as Record<string, unknown>;
  const options = this.getOptions() as FindOptions;
  const projection = this.projection() as Record<string, unknown> | undefined;
  // `op` is set at runtime (`find`, `findOne`, `countDocuments`) but not in the public typings.
  const op = (this as unknown as { op?: string }).op;
  switch (op) {
    case "find":
      recordCall("find", options.limit);
      return find(documents(), filter, options, projection);
    case "findOne":
      recordCall("find", 1);
      return find(documents(), filter, { ...options, limit: 1 }, projection)[0] ?? null;
    case "countDocuments":
      recordCall("count");
      return documents().filter(doc => matches(filter, doc)).length;
    case "updateMany": {
      const matchedCount = write("update", filter, this.getUpdate() as Record<string, unknown>);
      return { acknowledged: true, matchedCount, modifiedCount: matchedCount, upsertedCount: 0 };
    }
    case "deleteMany":
      return { acknowledged: true, deletedCount: write("delete", filter) };
    default:
      throw new Error(`fake-mongo: unsupported op "${op}"`);
  }
} as typeof realExec;

/** Mongo returns `_id`; the table speaks `id`. */
const normalize = (row: Record<string, unknown>) => {
  if (!("_id" in row)) return row;
  const { _id, ...rest } = row;
  return { id: _id, ...rest };
};

/** The 2.x behaviour for the cases that predate the policy: every fixture path, every operator, every sort path. */
const PATHS = ["_id", "name", "email", "age", "createdAt"];
const OPEN_POLICY = { filterable: Object.fromEntries(PATHS.map(key => [key, "*"])), sortable: PATHS };
const policyOptions = (policy: CaseOptions["policy"]) => (policy === undefined ? OPEN_POLICY : policy === "default" ? {} : policy);

export const mongooseHarness: Harness = {
  name: "mongoose",
  async run(call: Call, options: CaseOptions, onSkipped) {
    const registry = createRegistry(mongoose.connection, {
      strict: options.strict,
      onSkippedCondition: onSkipped,
      cursorSecret: options.cursorSecret,
      timestamps: options.timestamps,
    });
    const repository = registry.repository(ConformanceUser, {
      ...policyOptions(options.policy),
      forcedColumns: options.forcedColumns,
      allowedColumns: options.allowedColumns,
      scope: options.scope,
    } as never) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    return toResult(await repository[call.method]!(...callArgs(call)), normalize);
  },
};

/** Proof that the suite ran without a database: no connect call, connection never opened. */
export function assertNoConnection(): boolean {
  const offline = connectCalls === 0 && mongoose.connection.readyState === mongoose.ConnectionStates.disconnected;
  console.log(`${offline ? "✅" : "❌"} mongoose: no connection (connect calls ${connectCalls}, readyState ${mongoose.connection.readyState})`);
  return offline;
}

if ((import.meta as { main?: boolean }).main) {
  await import("./policy"); // task 011 attack tests — only when this file is the entry point, not when web/conformance imports it
  const summary = await runConformance(mongooseHarness);
  const offline = assertNoConnection();
  if (summary.failed > 0 || !offline) process.exitCode = 1;
}
