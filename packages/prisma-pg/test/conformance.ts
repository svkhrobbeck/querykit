/**
 * Conformance runner for @querykitjs/prisma-pg — **no database required**
 * (needs the generated fixture client: `bun run test:generate`).
 *
 *   bun run packages/prisma-pg/test/conformance.ts
 *
 * The real repository runs against a fake client whose `user` delegate
 * evaluates the Prisma args (`fake-prisma.ts`) on the shared fixture rows; the
 * shared table judges the result (`packages/core/test/conformance`).
 */
import type { Call, CaseOptions } from "../../core/test/conformance/cases";
import { cloneRows, recordCall, writeRows, type ConformanceRow } from "../../core/test/conformance/fixtures";
import { callArgs, toResult } from "../../core/test/conformance/harness-util";
import { runConformanceCli, type Harness } from "../../core/test/conformance/runner";
import { createRegistry } from "../src/index";

import { count, evalWhere, findMany, type FindManyArgs } from "./fake-prisma";
import { createTestClient } from "./prisma/client";

/** Model metadata comes from the generated client; no connection is opened. */
const prisma = createTestClient();

type Where = Record<string, unknown> | undefined;

/** `updateMany` / `updateManyAndReturn` / `deleteMany` on the case's rows (task 013). */
function write(kind: "update" | "delete", args: { where?: Where; data?: Record<string, unknown> }): ConformanceRow[] {
  recordCall("write");
  const rows = cloneRows();
  const hit = new Set(rows.filter(row => evalWhere(args.where, row) === true).map(row => row.id));
  const changed = kind === "update" ? rows.map(row => (hit.has(row.id) ? ({ ...row, ...args.data } as ConformanceRow) : row)) : rows;
  writeRows(kind === "update" ? changed : rows.filter(row => !hit.has(row.id)));
  return changed.filter(row => hit.has(row.id));
}

const fakeClient = {
  _runtimeDataModel: (prisma as unknown as { _runtimeDataModel: unknown })._runtimeDataModel,
  user: {
    findMany: async (args?: FindManyArgs) => (recordCall("find", args?.take), findMany(cloneRows(), args)),
    findFirst: async (args?: FindManyArgs) => (recordCall("find", 1), findMany(cloneRows(), { ...args, take: 1 })[0] ?? null),
    count: async (args?: { where?: Record<string, unknown> }) => (recordCall("count"), count(cloneRows(), args)),
    updateMany: async (args: { where?: Where; data: Record<string, unknown> }) => ({ count: write("update", args).length }),
    updateManyAndReturn: async (args: { where?: Where; data: Record<string, unknown> }) => write("update", args),
    deleteMany: async (args: { where?: Where } = {}) => ({ count: write("delete", args).length }),
  },
};

/** The 1.x behaviour for the cases that predate the policy: every fixture field, every operator, every sort field. */
const FIELDS = ["id", "name", "email", "age", "createdAt"];
const OPEN_POLICY = { filterable: Object.fromEntries(FIELDS.map(key => [key, "*"])), sortable: FIELDS };
const policyOptions = (policy: CaseOptions["policy"]) => (policy === undefined ? OPEN_POLICY : policy === "default" ? {} : policy);

export const prismaHarness: Harness = {
  name: "prisma-pg",
  async run(call: Call, options: CaseOptions, onSkipped) {
    const registry = createRegistry(fakeClient as never, { strict: options.strict, onSkippedCondition: onSkipped, cursorSecret: options.cursorSecret });
    const repository = registry.repository(
      "user" as never,
      {
        ...policyOptions(options.policy),
        forcedColumns: options.forcedColumns,
        allowedColumns: options.allowedColumns,
        // Task 021 B11: Prisma 7's runtime model has no nullability, so the fixture declares it.
        fields: [{ name: "age", isRequired: false }],
        scope: options.scope,
      } as never,
    ) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    return toResult(await repository[call.method]!(...callArgs(call)));
  },
};

if ((import.meta as { main?: boolean }).main) await runConformanceCli(prismaHarness);
