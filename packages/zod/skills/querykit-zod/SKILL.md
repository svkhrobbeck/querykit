---
name: querykit-zod
description: Use when code validates a querykit list request body with zod (@querykitjs/zod) - makeOffsetParamsSchema / makeInfiniteParamsSchema / makeCursorParamsSchema, the allow option for columns / with / withDeleted, request limits (maxPerPage, maxLimit, limits), withTotal, reading a refused payload's issues, or the MadeOffsetParams / MadeInfiniteParams / MadeCursorParams types.
---

## Safety rules

- DO build request schemas with the factories `makeOffsetParamsSchema`, `makeInfiniteParamsSchema`, `makeCursorParamsSchema`. DON'T use the constant schemas: they have no page-size ceiling and accept `columns` / `with` / `withDeleted` from the client.
- DON'T open `columns`, `with` or `withDeleted` by default. They are server-owned: a factory strips them unless you pass `allow: ["withDeleted"]` (or `"columns"`, `"with"`) on purpose, and then the repository's `forcedColumns` / `allowedColumns` / `relations` still decide.
- DO keep the ceilings: `perPage` ≤ `200` (`maxPerPage`) and `limit` ≤ `200` (`maxLimit`). `Infinity` removes a ceiling and opens a DoS surface.
- DO keep the request limits from core `DEFAULT_QUERY_LIMITS`: depth `5`, conditions `30`, array items `200`, string length `256`, offset `10000`, sort fields `3`. Raise one for one endpoint with `limits: { … }`. DON'T write your own size checks.
- DO treat the schema as the first line only: the repository's `filterable` / `sortable` policy on the server is still the authority on which fields and operators a client may use.
- DO return a refused body as HTTP 400 with the zod issues; the message names the limit and its value.

## When to use

- A Node backend (Hono, Express, Fastify, NestJS with a zod pipe…) that receives the JSON body `@querykitjs/web` sends and passes it to a querykit repository.
- One schema per list endpoint: offset, infinite scroll or cursor.

With class-validator DTOs use `@querykitjs/class-validator`; the request contract is the same.

## Setup

```ts
import { z } from "zod";
import { makeOffsetParamsSchema, type MadeOffsetParams } from "@querykitjs/zod";

export const listSchema = makeOffsetParamsSchema(); // perPage ≤ 200, no columns / with / withDeleted
export type ListParams = MadeOffsetParams; // or z.infer<typeof listSchema>

declare function findList(params: ListParams): Promise<{ data: unknown[] }>;

export async function list(body: unknown) {
  const params = listSchema.parse(body); // throws z.ZodError on a bad or oversized payload
  return findList(params);
}
export type Inferred = z.infer<typeof listSchema>;
```

## Common tasks

### Infinite scroll and cursor schemas

```ts
import { makeCursorParamsSchema, makeInfiniteParamsSchema } from "@querykitjs/zod";

const feedSchema = makeInfiniteParamsSchema({ maxLimit: 50 }); // limit / offset
const timelineSchema = makeCursorParamsSchema(); // limit / cursor / cursorKey / order / direction — no sort

const feed = feedSchema.parse({ limit: 20, offset: 40 });
const page = timelineSchema.parse({ limit: 20, cursorKey: "createdAt", order: "desc" });
console.log(feed.limit, page.cursorKey);
```

### Skip the count query with `withTotal`

```ts
import { makeOffsetParamsSchema } from "@querykitjs/zod";

const listSchema = makeOffsetParamsSchema();
const params = listSchema.parse({ page: 3, perPage: 50, withTotal: false });
// withTotal: false ⇒ the repository runs no count; meta.total_items / total_pages are null
console.log(params.withTotal);
```

### Open a server-owned field on purpose

```ts
import { makeOffsetParamsSchema, type MadeOffsetParams } from "@querykitjs/zod";

const adminList = makeOffsetParamsSchema({ allow: ["withDeleted"] }); // only for an admin route
type AdminParams = MadeOffsetParams<["withDeleted"]>;

const params: AdminParams = adminList.parse({ page: 1, withDeleted: true });
console.log(params.withDeleted);
```

### Raise one limit and read a refusal

```ts
import { makeOffsetParamsSchema } from "@querykitjs/zod";

const importList = makeOffsetParamsSchema({ limits: { maxInItems: 500 } }); // the others keep their defaults

const result = importList.safeParse({ filter: [{ key: "id", operation: "in", value: Array.from({ length: 501 }, (_, i) => i) }] });
if (!result.success) {
  for (const issue of result.error.issues) console.log(issue.path.join("."), issue.message); // "filter exceeds maxInItems (500)"
}
```

### Filter and sort shapes

```ts
import { makeOffsetParamsSchema } from "@querykitjs/zod";

const listSchema = makeOffsetParamsSchema();
const params = listSchema.parse({
  filter: { and: [{ key: "status", operation: "in", value: ["active", "trial"] }, { or: [{ key: "age", operation: ">=", value: 18 }] }] },
  sort: [
    { key: "name", direction: "asc" },
    { key: "createdAt", direction: "desc" },
  ],
  page: 1,
  perPage: 20,
});
console.log(params.sort?.length);
```

## Request contract

The same JSON shape as every querykit package (`@querykitjs/core`): conditions `{ key, operation?, value? }`, groups `{ and }` / `{ or }` / `{ not }` (a flat array = AND), `sort` always `[{ key, direction? }]`, offset `page` / `perPage` / `withTotal`, infinite `limit` / `offset`, cursor `limit` / `cursor` / `cursorKey` / `order` / `direction` (no `sort`). Meta is snake_case: `total_items`, `total_pages`, `has_next`, `has_more`, `next_offset`, `next_cursor`, `prev_cursor`. The body types are `WireOffsetParams`, `WireInfiniteParams` and `WireCursorParams`; validate with `@querykitjs/zod` or `@querykitjs/class-validator`, then pass the body as is. Refusals are `QueryKitError` with `{ source, site, key, operation?, reason }`.

## Mistakes to avoid

- Using the legacy constant schemas `offsetParamsSchema`, `infiniteParamsSchema`, `cursorParamsSchema` for a public endpoint.
- Typing a schema with `ReturnType<typeof makeOffsetParamsSchema>`: with a `const` type parameter it resolves to `any`. Use `z.infer<typeof schema>` or `MadeOffsetParams<…>`.
- Calling `.pick()` / `.omit()` on a factory schema: zod 4 refuses them on an object with a refinement. Call the factory with the options you need, or use `.extend()`.
- Validating a nested node with `filterNodeSchema` alone: it carries no limits. Use `filterSchema` or a factory.
- Sending `sort` with a cursor request: cursor pages order by `cursorKey` and `order` only.
