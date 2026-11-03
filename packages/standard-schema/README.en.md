# @querykitjs/standard-schema

> [Standard Schema v1](https://standardschema.dev) validators for the querykit request contract — filters, sort, offset / infinite / cursor pagination. No validator library needed.

[O'zbekcha](./README.md)

For a backend on valibot, arktype or Effect Schema — or with no validator at all — and for anything that takes a Standard Schema: Hono `sValidator`, tRPC `.input()`. The same names, options and results as [`@querykitjs/zod`](../zod/README.en.md); the same rejection paths and keys as [`@querykitjs/class-validator`](../class-validator/README.en.md). All three run the same core checks, so they accept and refuse the same bodies.

## Install

```bash
npm i @querykitjs/standard-schema
```

### Requirements

|         | Version   |
| ------- | --------- |
| Node.js | `>=22.12` |

The only dependency is `@querykitjs/core`. There are no peer dependencies: the Standard Schema interface is built in.

## Usage

### Hono

```ts
import { sValidator } from "@hono/standard-validator";
import { makeOffsetParamsSchema } from "@querykitjs/standard-schema";

app.post("/users/list", sValidator("json", makeOffsetParamsSchema()), async c => {
  const params = c.req.valid("json"); // { page?, perPage?, withTotal?, filter?, sort? }
  return c.json(await usersRepository.findList(params));
});
```

A refused body is answered `400` before the handler runs.

### tRPC

```ts
import { makeCursorParamsSchema } from "@querykitjs/standard-schema";

const timeline = t.procedure.input(makeCursorParamsSchema()).query(({ input }) => postsRepository.findCursor(input));
```

### Without a framework

```ts
const result = makeOffsetParamsSchema()["~standard"].validate(body);
if (result.issues) return badRequest(result.issues);
const params = result.value;
```

`validate` is synchronous.

## Schemas

| Export                                                           | Validates                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `makeOffsetParamsSchema(options?)`                               | `page`, `perPage` (≤ `maxPerPage`), `withTotal`, `filter`, `sort`          |
| `makeInfiniteParamsSchema(options?)`                             | `limit` (≤ `maxLimit`), `offset` (≤ `maxOffset`), `filter`, `sort`         |
| `makeCursorParamsSchema(options?)`                               | `limit`, `cursor`, `cursorKey`, `order`, `direction`, `filter` — no `sort` |
| `makeFilterSchema({ limits?, allowedKeys?, allowedOperators? })` | a filter on its own                                                        |
| `filterSchema`, `sortSchema`                                     | a filter / a sort under the core default limits                            |

Types: `ParamsSchemaOptions`, `ServerOwnedField`, `MadeOffsetParams` / `MadeInfiniteParams` / `MadeCursorParams`, `QueryKitIssue`, `StandardSchemaV1`, `InferOutput`.

## Safe by default

| Option       | Default                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| `maxPerPage` | core `DEFAULT_MAX_PER_PAGE` (200)                                                                            |
| `maxLimit`   | core `DEFAULT_MAX_LIMIT` (200)                                                                               |
| `limits`     | core `DEFAULT_QUERY_LIMITS` (depth 5, conditions 30, array 200, string 256, offset 10 000, sort 3)           |
| `allow`      | none — `columns`, `with`, `withDeleted` from the client are stripped; open one with `allow: ["withDeleted"]` |

The size limits are checked first, without recursion: a 10 000-level filter is refused in microseconds. `(page - 1) × perPage` beyond `maxOffset` is refused on `page`; deeper pages need a cursor.

## Issues

Every issue has the Standard Schema `message` and `path`, plus `key` and `args` for your own translation:

```ts
{ path: ["perPage"], key: "querykit.params.out_of_range", args: { max: 200 }, message: "perPage is out of the allowed range" }
```

The filter and sort keys are the ones `@querykitjs/class-validator` uses (its `uz` / `ru` catalogs translate them).

## Agent skill

The package ships `skills/querykit-standard-schema/SKILL.md` for AI coding assistants.

## License

MIT
