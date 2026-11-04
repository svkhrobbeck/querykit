/**
 * The default `ON CONFLICT` set under drizzle's `casing`, on the statement drizzle builds. A
 * `text()` column takes its name from the key, so `casing` decides it; `text("named_col")` keeps
 * its name in every mode. Imported by `sql.ts` (offline, in the gate); sets `process.exitCode`.
 */
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";

import { createRegistry } from "../src/index";
import type { AnyDb } from "../src/types";

const geocodeCache = pgTable("geocode_cache", {
  key: text().primaryKey(),
  addressText: text(),
  namedCol: text("named_col"),
  createdAt: timestamp(),
  updatedAt: timestamp(),
});
const schema = { geocodeCache };

type Casing = "snake_case" | "camelCase" | undefined;

interface InsertBuilder {
  onConflictDoUpdate(config: unknown): { returning(): { toSQL(): { sql: string } } };
}

// A repository on real query builders: a statement is recorded where a driver would run it.
function repositoryFor(casing: Casing) {
  const statements: string[] = [];
  const mock = drizzle.mock({ schema, ...(casing ? { casing } : {}) });
  const db = {
    query: mock.query,
    insert: (table: typeof geocodeCache) => ({
      values: (values: never) => {
        const insert = mock.insert(table).values(values) as unknown as InsertBuilder;
        return {
          onConflictDoUpdate: (config: unknown) => ({
            returning: async () => {
              statements.push(insert.onConflictDoUpdate(config).returning().toSQL().sql);
              return [{ key: "k" }];
            },
          }),
        };
      },
    }),
  } as unknown as AnyDb;
  return { statements, repository: createRegistry(db, schema).repository(geocodeCache) };
}

let failed = 0;
function check(label: string, ok: boolean, statement: string) {
  console.log(`${ok ? "✅" : "❌"} [upsert casing] ${label}${ok ? "" : ` — ${statement}`}`);
  if (!ok) failed++;
}
const holdsAll = (statement: string, parts: string[]) => parts.every(part => statement.includes(part));
// Only `set`: `returning` names every column.
const conflictSetOf = (statement: string) => statement.split("do update set")[1]?.split(" returning ")[0] ?? "";

const ROW = { key: "k", addressText: "Tashkent", namedCol: "n", createdAt: new Date(0) };
const MODES: [Casing, string, string][] = [
  ["snake_case", "address_text", "updated_at"],
  ["camelCase", "addressText", "updatedAt"],
  [undefined, "addressText", "updatedAt"],
];

for (const [casing, address, updated] of MODES) {
  const expected = [`"${address}" = "excluded"."${address}"`, `"named_col" = "excluded"."named_col"`, `"${updated}" = now()`];

  const mode = casing ?? "no casing";

  const one = repositoryFor(casing);
  await one.repository.upsert(ROW, { target: "key" });
  const upsert = one.statements[0] ?? "";
  check(`${mode}: upsert`, holdsAll(upsert, expected), upsert);
  const conflictSet = conflictSetOf(upsert);
  check(`${mode}: the target and createdAt stay out of the set`, conflictSet !== "" && !/"key"|"created_?at"/i.test(conflictSet), conflictSet);

  const many = repositoryFor(casing);
  await many.repository.upsertMany([ROW], { target: "key" });
  const upsertMany = many.statements[0] ?? "";
  check(`${mode}: upsertMany`, holdsAll(upsertMany, expected), upsertMany);

  const given = repositoryFor(casing);
  await given.repository.upsert(ROW, { target: "key", set: { addressText: "given" } });
  const withSet = given.statements[0] ?? "";
  check(`${mode}: a caller's set stays a parameter`, holdsAll(withSet, [`set "${address}" = $`]), withSet);
}

if (failed > 0) process.exitCode = 1;
