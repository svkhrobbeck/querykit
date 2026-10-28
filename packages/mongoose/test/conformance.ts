/**
 * Conformance runner for @querykitjs/mongoose — **no database, no connection**.
 *
 *   bun --preload ./packages/mongoose/test/_bun-v8-shim.ts packages/mongoose/test/conformance.ts
 *
 * The real repository builds real mongoose queries; `Query.prototype.exec` is
 * replaced for the fixture model: the filter is cast by mongoose itself
 * (`query.cast()`, the schema's casting) and evaluated by `fake-mongo.ts` on
 * the shared fixture rows. `mongoose.connect` throws if anything calls it.
 */
import mongoose, { Schema, Types, type Query } from "mongoose";

import type { Call, CaseOptions } from "../../core/test/conformance/cases";
import { cloneRows } from "../../core/test/conformance/fixtures";
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
      return find(documents(), filter, options, projection);
    case "findOne":
      return find(documents(), filter, { ...options, limit: 1 }, projection)[0] ?? null;
    case "countDocuments":
      return documents().filter(doc => matches(filter, doc)).length;
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

export const mongooseHarness: Harness = {
  name: "mongoose",
  async run(call: Call, options: CaseOptions, onSkipped) {
    const registry = createRegistry(mongoose.connection, { strict: options.strict, onSkippedCondition: onSkipped });
    const repository = registry.repository(ConformanceUser, {
      forcedColumns: options.forcedColumns,
      allowedColumns: options.allowedColumns,
    } as never) as unknown as Record<string, (params: unknown) => Promise<unknown>>;
    const result = (await repository[call.method]!(call.params)) as
      Record<string, unknown>[] | { data: Record<string, unknown>[]; meta: Record<string, unknown> };
    return Array.isArray(result) ? { rows: result.map(normalize) } : { rows: result.data.map(normalize), meta: result.meta };
  },
};

/** Proof that the suite ran without a database: no connect call, connection never opened. */
export function assertNoConnection(): boolean {
  const offline = connectCalls === 0 && mongoose.connection.readyState === mongoose.ConnectionStates.disconnected;
  console.log(`${offline ? "✅" : "❌"} mongoose: no connection (connect calls ${connectCalls}, readyState ${mongoose.connection.readyState})`);
  return offline;
}

if ((import.meta as { main?: boolean }).main) {
  const summary = await runConformance(mongooseHarness);
  const offline = assertNoConnection();
  if (summary.failed > 0 || !offline) process.exitCode = 1;
}
