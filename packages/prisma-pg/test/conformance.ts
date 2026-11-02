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
import { cloneRows } from "../../core/test/conformance/fixtures";
import { runConformanceCli, type Harness } from "../../core/test/conformance/runner";
import { createRegistry } from "../src/index";

import { count, findMany, type FindManyArgs } from "./fake-prisma";
import { createTestClient } from "./prisma/client";

/** Model metadata comes from the generated client; no connection is opened. */
const prisma = createTestClient();

const fakeClient = {
  _runtimeDataModel: (prisma as unknown as { _runtimeDataModel: unknown })._runtimeDataModel,
  user: {
    findMany: async (args?: FindManyArgs) => findMany(cloneRows(), args),
    findFirst: async (args?: FindManyArgs) => findMany(cloneRows(), { ...args, take: 1 })[0] ?? null,
    count: async (args?: { where?: Record<string, unknown> }) => count(cloneRows(), args),
  },
};

/** The 1.x behaviour for the cases that predate the policy: every fixture field, every operator, every sort field. */
const FIELDS = ["id", "name", "email", "age", "createdAt"];
const OPEN_POLICY = { filterable: Object.fromEntries(FIELDS.map(key => [key, "*"])), sortable: FIELDS };
const policyOptions = (policy: CaseOptions["policy"]) => (policy === undefined ? OPEN_POLICY : policy === "default" ? {} : policy);

export const prismaHarness: Harness = {
  name: "prisma-pg",
  async run(call: Call, options: CaseOptions, onSkipped) {
    const registry = createRegistry(fakeClient as never, { strict: options.strict, onSkippedCondition: onSkipped });
    const repository = registry.repository(
      "user" as never,
      {
        ...policyOptions(options.policy),
        forcedColumns: options.forcedColumns,
        allowedColumns: options.allowedColumns,
        // Task 021 B11: Prisma 7's runtime model has no nullability, so the fixture declares it.
        fields: [{ name: "age", isRequired: false }],
      } as never,
    ) as unknown as Record<string, (params: unknown) => Promise<unknown>>;
    const result = (await repository[call.method]!(call.params)) as
      Record<string, unknown>[] | { data: Record<string, unknown>[]; meta: Record<string, unknown> };
    return Array.isArray(result) ? { rows: result } : { rows: result.data, meta: result.meta };
  },
};

if ((import.meta as { main?: boolean }).main) await runConformanceCli(prismaHarness);
