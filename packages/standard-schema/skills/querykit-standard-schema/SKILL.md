---
name: querykit-standard-schema
description: Use when a backend validates a querykit list request body without zod or class-validator (@querykitjs/standard-schema) - Standard Schema v1 validators for valibot, arktype or Effect projects, Hono sValidator, tRPC .input() - makeOffsetParamsSchema / makeInfiniteParamsSchema / makeCursorParamsSchema, makeFilterSchema, filterSchema, sortSchema, the allow option for columns / with / withDeleted, request limits, or reading the issues (path, key, message).
---

## Safety rules

- DO build request schemas with `makeOffsetParamsSchema`, `makeInfiniteParamsSchema`, `makeCursorParamsSchema`. They strip unknown fields and the server-owned `columns` / `with` / `withDeleted`.
- DON'T open `columns`, `with` or `withDeleted` by default. Pass `allow: ["withDeleted"]` (or `"columns"`, `"with"`) only on purpose; the repository's `forcedColumns` / `allowedColumns` / `relations` still decide.
- DO keep the ceilings: `perPage` ≤ `200` (`maxPerPage`), `limit` ≤ `200` (`maxLimit`). `Infinity` removes a ceiling and opens a DoS surface.
- DO keep the request limits from core `DEFAULT_QUERY_LIMITS`: depth `5`, conditions `30`, array items `200`, string length `256`, offset `10000`, sort fields `3`. Raise one for one endpoint with `limits: { … }`.
- DO treat the schema as the first line only: the repository's `filterable` / `sortable` policy is still the authority on which fields and operators a client may use.
- DO answer a refused body with HTTP 400. Every issue has `path`, an English `message`, and `key` + `args` for your own translation.

## When to use

- A backend on valibot, arktype or Effect Schema — or one with no validator library — that receives the JSON body `@querykitjs/web` sends.
- Anything that takes a Standard Schema: Hono `sValidator("json", schema)`, tRPC `.input(schema)`.

With zod use `@querykitjs/zod`; with class-validator DTOs use `@querykitjs/class-validator`. All three accept and refuse the same bodies.

## Setup

```ts
import { makeOffsetParamsSchema, type MadeOffsetParams } from "@querykitjs/standard-schema";

export const listSchema = makeOffsetParamsSchema(); // perPage ≤ 200, no columns / with / withDeleted

export function parseList(body: unknown): MadeOffsetParams {
  const result = listSchema["~standard"].validate(body);
  if (result instanceof Promise) throw new Error("querykit schemas validate synchronously");
  if (result.issues) throw new Error(result.issues.map(issue => issue.message).join("; "));
  return result.value; // { page?, perPage?, withTotal?, filter?, sort? }
}
```

## Common tasks

### Hono and tRPC

```ts
import { makeCursorParamsSchema, makeOffsetParamsSchema, type StandardSchemaV1 } from "@querykitjs/standard-schema";

// app.post("/users/list", sValidator("json", usersList), c => c.json(c.req.valid("json")));
export const usersList: StandardSchemaV1 = makeOffsetParamsSchema({ maxPerPage: 100 });

// t.procedure.input(timeline).query(({ input }) => input.cursorKey);
export const timeline = makeCursorParamsSchema(); // limit / cursor / cursorKey / order / direction — no sort
```

### Open a server-owned field on purpose

```ts
import { makeOffsetParamsSchema } from "@querykitjs/standard-schema";

const adminList = makeOffsetParamsSchema({ allow: ["withDeleted"] });
const result = adminList["~standard"].validate({ page: 1, withDeleted: true });
console.log(result); // { value: { page: 1, withDeleted: true } }
```

### Read an issue

```ts
import { makeOffsetParamsSchema, type QueryKitIssue } from "@querykitjs/standard-schema";

const result = makeOffsetParamsSchema()["~standard"].validate({ perPage: 201 });
if (!(result instanceof Promise) && result.issues) {
  const issue = result.issues[0] as QueryKitIssue;
  console.log(issue.path, issue.key, issue.message); // ["perPage"] "querykit.params.out_of_range" "perPage is out of the allowed range"
}
```

### A filter or a sort on its own

```ts
import { filterSchema, makeFilterSchema, sortSchema } from "@querykitjs/standard-schema";

const strict = makeFilterSchema({ allowedKeys: ["status", "createdAt"], limits: { maxInItems: 50 } });
console.log(strict["~standard"].validate({ key: "status", operation: "in", value: ["active"] }));
console.log(filterSchema["~standard"].validate([{ key: "name", value: "a" }]), sortSchema["~standard"].validate([{ key: "name", direction: "asc" }]));
```
