/**
 * Task 014 P4 (R21) — `checkWith`: the client's `with` against `relations`.
 * Imported by `internal.ts`; sets `process.exitCode`.
 */
import { QueryKitError, type Relations } from "../src/index";
import { checkWith, type WithDialect } from "../src/internal/index";

let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} [with] ${label}${extra ? ` — ${extra}` : ""}`);
}

const PRISMA: WithDialect = {
  columns: "select",
  nested: "include",
  filters: ["where"],
  logical: ["AND", "OR", "NOT"],
  paging: ["take", "skip"],
  orderBy: "orderBy",
};
const MONGO: WithDialect = {
  columns: "select",
  nested: "populate",
  filters: ["match"],
  logical: ["$and", "$or", "$nor"],
  paging: ["limit", "skip"],
  options: "options",
};

/** The refused key, or "ok <json>". */
function run(withValue: unknown, relations: Relations | undefined, dialect = PRISMA): string {
  try {
    return `ok ${JSON.stringify(checkWith(withValue, relations, dialect, "users"))}`;
  } catch (err) {
    if (err instanceof QueryKitError && err.info.site === "with" && err.info.reason === "forbidden-key") return `refused ${err.info.key}`;
    throw err;
  }
}

const POSTS: Relations = { posts: { columns: ["title"], filterable: { title: "*" } } };
const shorthand = { author: function Author() {} } as unknown as Relations;

check("no relations → forbidden-key posts", run({ posts: true }, undefined) === "refused posts");
check("mongoose bare-Model shorthand opens nothing (R21)", run({ author: true }, shorthand, MONGO) === "refused author");
check("a rule without columns opens nothing (R21)", run({ posts: true }, { posts: { filterable: {} } } as unknown as Relations) === "refused posts");
check("columns list: an unlisted column → forbidden-key posts.body", run({ posts: { select: { body: true } } }, POSTS) === "refused posts.body");
check("columns list: a listed column passes", run({ posts: { select: { title: true } } }, POSTS) === 'ok {"posts":{"select":{"title":true}}}');
check(
  "columns list + true → only the listed columns are selected",
  run({ posts: true }, POSTS) === 'ok {"posts":{"select":{"title":true}}}',
  run({ posts: true }, POSTS),
);
check('columns "*" passes any selection', run({ posts: { select: { body: true } } }, { posts: { columns: "*" } }).startsWith("ok"));
check('columns "*" + true stays true', run({ posts: true }, { posts: { columns: "*" } }) === 'ok {"posts":true}');
check("mongoose exclusion select (-title) with a list → refused", run({ posts: { select: "-title" } }, POSTS, MONGO) === "refused posts.-title");
check("filter on an unlisted field → forbidden-key posts.secret", run({ posts: { where: { secret: "x" } } }, POSTS) === "refused posts.secret");
check("filter inside OR is walked", run({ posts: { where: { OR: [{ title: "a" }, { secret: 1 }] } } }, POSTS) === "refused posts.secret");
check("filter on a listed field passes", run({ posts: { where: { title: "a" } } }, POSTS).startsWith("ok"));
check("no filterable → any filter refused", run({ posts: { match: { title: "a" } } }, { posts: { columns: ["title"] } }, MONGO) === "refused posts.title");
check("mongoose $where in match → refused", run({ posts: { match: { $where: "1" } } }, POSTS, MONGO) === "refused posts.$where");
check("nested with and no nested rule → refused", run({ posts: { include: { author: true } } }, POSTS) === "refused posts.author");
check(
  "nested rule allows the nested relation",
  run({ posts: { include: { author: true } } }, { posts: { columns: "*", nested: { author: { columns: ["name"] } } } }) ===
    'ok {"posts":{"include":{"author":{"select":{"name":true}}}}}',
);
check("an unknown option → refused", run({ posts: { cursor: { id: 1 } } }, POSTS) === "refused posts.cursor");
check(
  "paging passes; orderBy on an unlisted column is refused",
  run({ posts: { take: 5 } }, POSTS).startsWith("ok") && run({ posts: { orderBy: { body: "asc" } } }, POSTS) === "refused posts.body",
);
check(
  "mongoose options: limit passes, sort is refused",
  run({ posts: { options: { limit: 5 } } }, POSTS, MONGO).startsWith("ok") &&
    run({ posts: { options: { sort: { body: 1 } } } }, POSTS, MONGO) === "refused posts.options.sort",
);

if (failed > 0) process.exitCode = 1;
console.log(`with: ${failed} failed`);
