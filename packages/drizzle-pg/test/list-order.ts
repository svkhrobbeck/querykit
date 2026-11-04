/**
 * The ORDER BY of paged reads on the table shapes the conformance fixture does not have: no
 * primary key, a composite one, one not named `id`. Imported by `sql.ts` (offline, in the gate);
 * sets `process.exitCode`.
 */
import type { SQL } from "drizzle-orm";
import { integer, PgDialect, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { createRegistry } from "../src/index";
import type { AnyDb } from "../src/types";

const labels = pgTable("labels", { name: text("name").notNull() });
const slugs = pgTable("slugs", { slug: text("slug").primaryKey(), title: text("title") });
const memberships = pgTable(
  "memberships",
  {
    orgId: integer("org_id").notNull(),
    // Unnamed: the column takes its name from the key.
    userId: integer().notNull(),
    role: text("role"),
  },
  table => [primaryKey({ columns: [table.orgId, table.userId] })],
);
const schema = { labels, slugs, memberships };

let orderBy: SQL[] = [];
const handle = {
  findMany: async (config: { orderBy: SQL[] }) => ((orderBy = config.orderBy), []),
  findFirst: async (config: { orderBy: SQL[] }) => ((orderBy = config.orderBy), undefined),
};
const db = {
  query: { labels: handle, slugs: handle, memberships: handle },
  select: () => ({ from: async () => [{ value: 0 }] }),
} as unknown as AnyDb;
const registry = createRegistry(db, schema);

const dialect = new PgDialect();
const rendered = () => orderBy.map(item => dialect.sqlToQuery(item).sql).join(", ");

let passed = 0;
let failed = 0;
function check(label: string, want: string) {
  const got = rendered();
  console.log(`${got === want ? "✅" : "❌"} [list-order] ${label}${got === want ? "" : ` — ${got}, expected ${want}`}`);
  if (got === want) passed++;
  else failed++;
}

const noKey = registry.repository(labels, { sortable: ["name"] });
await noKey.findList({ sort: [{ key: "name" }] });
check("no primary key: findList keeps the sort, no error", `"labels"."name" asc nulls first`);
await noKey.findInfinite({ sort: [{ key: "name", direction: "desc" }] });
check("no primary key: findInfinite keeps the sort, no error", `"labels"."name" desc nulls last`);
await noKey.findList({});
check("no primary key, no sort: still no ORDER BY", "");

const named = registry.repository(slugs, { sortable: ["title"] });
await named.findList({ sort: [{ key: "title", direction: "desc" }] });
check("a primary key not named id breaks ties", `"slugs"."title" desc nulls last, "slugs"."slug" desc`);
await named.findInfinite({});
check("no sort, no createdAt: the primary key alone, descending like the default", `"slugs"."slug" desc`);
await named.findAll({ sort: [{ key: "title" }] });
check("findAll stays without the tie-break", `"slugs"."title" asc nulls first`);

const composite = registry.repository(memberships, { sortable: ["role", "userId"] });
await composite.findList({ sort: [{ key: "role" }] });
check("composite: every field, in key order", `"memberships"."role" asc nulls first, "memberships"."org_id" asc, "memberships"."userId" asc`);
await composite.findInfinite({ sort: [{ key: "userId", direction: "desc" }] });
check("composite: a field already sorted on is not repeated", `"memberships"."userId" desc nulls last, "memberships"."org_id" desc`);
await composite.findList({});
check("composite, no sort: every field, descending", `"memberships"."org_id" desc, "memberships"."userId" desc`);
await composite.findOne({ sort: [{ key: "role" }] });
check("findOne stays without the tie-break", `"memberships"."role" asc nulls first`);

console.log(`list-order: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
