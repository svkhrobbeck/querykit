/**
 * Test-only fixtures (never published — see package.json "files").
 *
 * Kept in its own module so the cross-adapter contract audit in
 * `packages/prisma-pg/test/contract.ts` can drive this adapter's compilers with a
 * real table. Importing it from there works because a module's own dependencies
 * (`drizzle-orm`) resolve relative to *this* package.
 */
import type { SQL } from "drizzle-orm";
import { integer, pgTable, PgDialect, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  age: integer("age"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/** Render a built condition to real SQL + params (offline, no database). */
export function renderSql(query: SQL): { sql: string; params: unknown[] } {
  const rendered = new PgDialect().sqlToQuery(query);
  return { sql: rendered.sql, params: rendered.params as unknown[] };
}
