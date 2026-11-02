/**
 * @querykitjs/mongodb against the shared conformance table (task 006) — **no database**.
 *
 *   bun --preload ./packages/mongodb/test/bun-v8-shim.ts packages/mongodb/test/conformance.ts
 *
 * The repository runs over a fake driver `Collection`: `find(...).toArray()`,
 * `countDocuments`, `updateMany`, `deleteMany` evaluate the compiled Mongo filter on the
 * fixture rows with the mongoose adapter's in-memory matcher (`fake-mongo.ts`), so both
 * Mongo adapters are judged by the same Mongo semantics. Every driver call is recorded
 * (`driverCalls`) and also listed here with its options, so `maxTimeMS` is checked too.
 */
import { ObjectId, type Collection, type MongoClient } from "mongodb";
import { z } from "zod";

import type { Call, CaseOptions } from "../../core/test/conformance/cases";
import { cloneRows, recordCall, writeRows, type ConformanceRow } from "../../core/test/conformance/fixtures";
import { callArgs, toResult } from "../../core/test/conformance/harness-util";
import { runConformance, type Harness } from "../../core/test/conformance/runner";
import { find, matches } from "../../mongoose/test/fake-mongo";
import { createRegistry } from "../src/index";

type Doc = Record<string, unknown>;

/** The fixture's document schema — the one source of field types for the adapter. */
export const ConformanceUserSchema = z.object({
  name: z.string(),
  email: z.string(),
  age: z.number().nullable(),
  createdAt: z.date(),
});

const documents = (): Doc[] => cloneRows().map(({ id, ...rest }) => ({ _id: new ObjectId(id.toString(16).padStart(24, "0")), ...rest }));
const toRows = (docs: readonly Doc[]): ConformanceRow[] =>
  docs.map(({ _id, ...rest }) => ({ id: Number.parseInt(String(_id), 16), ...rest }) as ConformanceRow);

/** Options of every driver call, in order — read by the maxTimeMS check. */
export const driverOptions: { op: string; options: Record<string, unknown> }[] = [];

function write(kind: "update" | "delete", filter: Doc, update: Doc = {}): number {
  recordCall("write");
  const docs = documents();
  const hit = new Set(docs.filter(doc => matches(filter as never, doc)).map(doc => String(doc._id)));
  const patch = (update.$set as Doc | undefined) ?? {};
  const kept = kind === "update" ? docs.map(doc => (hit.has(String(doc._id)) ? { ...doc, ...patch } : doc)) : docs.filter(doc => !hit.has(String(doc._id)));
  writeRows(toRows(kept));
  return hit.size;
}

/** Only the calls the repository makes for the conformance cases; anything else throws. */
export const fakeCollection = {
  collectionName: "conformance_users",
  find(filter: Doc, options: Doc = {}) {
    driverOptions.push({ op: "find", options });
    recordCall("find", options.limit as number | undefined);
    return { toArray: async () => find(documents(), filter as never, options as never, options.projection as Doc | undefined) };
  },
  async countDocuments(filter: Doc, options: Doc = {}) {
    driverOptions.push({ op: "countDocuments", options });
    recordCall("count");
    return documents().filter(doc => matches(filter as never, doc)).length;
  },
  async updateMany(filter: Doc, update: Doc, options: Doc = {}) {
    driverOptions.push({ op: "updateMany", options });
    const matchedCount = write("update", filter, update);
    return { acknowledged: true, matchedCount, modifiedCount: matchedCount, upsertedCount: 0 };
  },
  async deleteMany(filter: Doc, options: Doc = {}) {
    driverOptions.push({ op: "deleteMany", options });
    return { acknowledged: true, deletedCount: write("delete", filter) };
  },
} as unknown as Collection<Doc>;

/** A client the conformance run never uses for I/O — only `transaction` would. */
const fakeClient = {} as MongoClient;

const normalize = (row: Doc) => {
  if (!("_id" in row)) return row;
  const { _id, ...rest } = row;
  return { id: _id, ...rest };
};

const PATHS = ["_id", "name", "email", "age", "createdAt"];
const OPEN_POLICY = { filterable: Object.fromEntries(PATHS.map(key => [key, "*"])), sortable: PATHS };
const policyOptions = (policy: CaseOptions["policy"]) => (policy === undefined ? OPEN_POLICY : policy === "default" ? {} : policy);

export const mongodbHarness: Harness = {
  name: "mongodb",
  async run(call: Call, options: CaseOptions, onSkipped) {
    const registry = createRegistry(fakeClient, {
      strict: options.strict,
      onSkippedCondition: onSkipped,
      cursorSecret: options.cursorSecret,
      timestamps: options.timestamps,
    });
    const repository = registry.repository(fakeCollection, {
      schema: ConformanceUserSchema,
      ...policyOptions(options.policy),
      forcedColumns: options.forcedColumns,
      allowedColumns: options.allowedColumns,
      scope: options.scope,
    } as never) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    return toResult(await repository[call.method]!(...callArgs(call)), normalize);
  },
};

if ((import.meta as { main?: boolean }).main) {
  const summary = await runConformance(mongodbHarness);
  const reads = driverOptions.filter(call => call.op === "find" || call.op === "countDocuments");
  const timed = reads.every(call => call.options.maxTimeMS === 2000);
  console.log(`${timed ? "✅" : "❌"} mongodb: maxTimeMS 2000 on all ${reads.length} reads (acceptance 4)`);
  if (summary.failed > 0 || !timed) process.exitCode = 1;
}
