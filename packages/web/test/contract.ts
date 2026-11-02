/**
 * Task 015 for @querykitjs/web: the builders and parsers follow the 012–014 backend
 * contract — registry `timestamps`, `withTotal`, nullable totals, the error body
 * guard, the `search` operation and the URL readers' clamp.
 * Imported by `smoke.ts`; sets `process.exitCode` on failure.
 */
import { buildListParams, createRegistry, defineListSchema, isQueryKitError, readListParams, searchParamsToPayload } from "../src/index";
import type { ListPayload } from "../src/index";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} [contract] ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}
const json = (value: unknown) => JSON.stringify(value);

/* A2: registry timestamps.createdAt names the default sort field. */
const createdAtRegistry = createRegistry({ adapter: "drizzle-pg", timestamps: { createdAt: "created_at" } }).resource<{ created_at: string }>("users");
const timestamped = createdAtRegistry.list();
check(
  "timestamps.createdAt → default sort created_at desc",
  json(timestamped.sort) === json([{ key: "created_at", direction: "desc" }]),
  json(timestamped.sort),
);
const sortWins = createRegistry({ adapter: "drizzle-pg", timestamps: { createdAt: "created_at" }, defaults: { sort: ["name"] } })
  .resource("users")
  .list();
check("defaults.sort wins over timestamps", json(sortWins.sort) === json([{ key: "name", direction: "asc" }]), json(sortWins.sort));
const plain = createRegistry({ adapter: "drizzle-pg" }).resource("users").list();
check("no timestamps → createdAt desc (unchanged)", json(plain.sort) === json([{ key: "createdAt", direction: "desc" }]), json(plain.sort));

/* A3: withTotal goes on the wire only when given. */
const noTotal: ListPayload = buildListParams({ page: 1, perPage: 10, withTotal: false });
check("buildListParams withTotal: false → payload withTotal false", noTotal.withTotal === false);
check("buildListParams without withTotal → no withTotal key", !("withTotal" in buildListParams({ page: 1 })));
check("resource.list passes withTotal", createRegistry({ adapter: "mongoose" }).resource("u").list({ withTotal: false }).withTotal === false);

/* A4: a null total stays null; an absent one is 0 as before. */
const users = createRegistry({ adapter: "prisma-pg" }).resource<{ id: number }>("users");
const uncounted = users.parseList({
  data: [{ id: 1 }],
  meta: { total_items: null, total_pages: null, current_page: 1, per_page: 10, has_next: true, has_prev: false },
});
check("parseList total_items null → totalCount null", uncounted.meta.totalCount === null && uncounted.meta.totalPages === null, json(uncounted.meta));
check("parseList keeps has_next without totals", uncounted.meta.hasNext);
const absent = users.parseList({ data: [], meta: {} });
check("parseList absent totals → 0 (unchanged)", absent.meta.totalCount === 0 && absent.meta.totalPages === 0, json(absent.meta));

/* A5: the error body guard. */
check("isQueryKitError(forbidden-key body) → true", isQueryKitError({ reason: "forbidden-key", site: "filter", key: "x" }));
check("isQueryKitError(full info with source/operation) → true", isQueryKitError({ source: "users", reason: "limit-exceeded", site: "page", key: "page" }));
check("isQueryKitError(other object) → false", !isQueryKitError({ message: "Bad Request", statusCode: 400 }));
check("isQueryKitError(unknown reason) → false", !isQueryKitError({ reason: "nope", site: "filter", key: "x" }));
check("isQueryKitError(unknown site) → false", !isQueryKitError({ reason: "forbidden-key", site: "body", key: "x" }));
check("isQueryKitError(null / string) → false", !isQueryKitError(null) && !isQueryKitError("forbidden-key"));

/* A6: search operation option; the default stays contains. */
const people = createRegistry({ adapter: "drizzle-pg" }).resource<{ name: string; email: string }>("people");
check(
  "search(term, fields, { operation: startsWith }) → startsWith conditions",
  json(people.search("al", ["name"], { operation: "startsWith" })) === json({ or: [{ key: "name", operation: "%_", value: "al" }] }),
  json(people.search("al", ["name"], { operation: "startsWith" })),
);
check(
  "search(term, fields) → contains (unchanged)",
  json(people.search("al", ["name", "email"])) ===
    json({
      or: [
        { key: "name", operation: "%_%", value: "al" },
        { key: "email", operation: "%_%", value: "al" },
      ],
    }),
  json(people.search("al", ["name", "email"])),
);

/* A7a: the URL readers clamp instead of throwing; `clamped` never reaches the wire. */
const schema = defineListSchema({ status: { operation: "=" } });
const deep = new URLSearchParams("page=9999&size=20");
const read = readListParams(schema, deep);
check("readListParams ?page=9999&size=20 → page 501, clamped", read.page === 501 && read.clamped === true, json(read));
const viaUrl = searchParamsToPayload(schema, deep);
check("searchParamsToPayload → page 501, clamped", viaUrl.page === 501 && viaUrl.clamped === true, json(viaUrl));
check("clamped is not on the wire", !("clamped" in JSON.parse(json(viaUrl))));
const viaRegistry = people.fromSearchParams(deep, { schema });
check("fromSearchParams → page 501, clamped", viaRegistry.page === 501 && viaRegistry.clamped === true, json(viaRegistry));
const sorted = readListParams(schema, new URLSearchParams("sort=a,b,c,d"), { sortParam: "sort" });
check("?sort=a,b,c,d → 3 fields, clamped", sorted.sort?.length === 3 && sorted.clamped === true, json(sorted.sort));
const fine = readListParams(schema, new URLSearchParams("page=501&size=20&sortType=a,b,c"));
check("in-bounds URL → not clamped", fine.page === 501 && fine.sort?.length === 3 && fine.clamped === false);
const tight = createRegistry({ adapter: "drizzle-pg", defaults: { maxOffset: 100, perPage: 10, maxSortFields: 1 } }).resource("t");
const tightPayload = tight.fromSearchParams(new URLSearchParams("page=50&sortType=a,b"), { schema });
check(
  "fromSearchParams uses the registry limits",
  tightPayload.page === 11 && tightPayload.sort.length === 1 && tightPayload.clamped === true,
  json({ page: tightPayload.page, sort: tightPayload.sort }),
);

/* A7b: a direct builder call still throws (task 008 Locked 5). */
let thrown = "";
try {
  buildListParams({ page: 502, perPage: 20 });
} catch (error) {
  thrown = error instanceof Error ? error.message : String(error);
}
check("buildListParams({ page: 502, perPage: 20 }) still throws", thrown.includes("maxOffset (10000)"), thrown || "built");

console.log(`contract: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
