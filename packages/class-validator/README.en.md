<div align="right">

**English** · [O'zbekcha](./README.md)

</div>

# @querykitjs/class-validator

> **class-validator** decorators and DTOs that validate the querykit request contract (filters, sort, pagination). Operators come from `@querykitjs/core`; DTO output is **assignable** to core types.

Validates the incoming JSON body of NestJS list endpoints — the full operator set, nested `and/or/not` filters, and **all three paginations** (offset/infinite/cursor). Pass the validated payload straight to a querykit repository.

Same role as [`@querykitjs/zod`](../zod/README.en.md), different tool: the same contract and the same operator source, expressed as class-validator decorators instead of zod schemas.

## Install

```bash
bun add @querykitjs/class-validator class-validator class-transformer
# @querykitjs/core comes transitively (dependency)
```

`reflect-metadata` is required too — Nest apps already import it in `main.ts`. Outside Nest, put this at the very top of your entry file:

```ts
import "reflect-metadata";
```

Without it, class-transformer's `@Type()` throws `Reflect.getMetadata is not a function`.

## Usage (NestJS)

`main.ts`:

```ts
app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
```

Controller — the **factory** form (recommended):

```ts
import { makeOffsetParamsDto } from "@querykitjs/class-validator";

const ListBuyersDto = makeOffsetParamsDto({ allowedKeys: ["buyerName", "createdAt", "status"] });
type ListBuyersDto = InstanceType<typeof ListBuyersDto>;

@Post("list")
list(@Body() params: ListBuyersDto) {
  return this.buyersRepository.findList(params); // core-aligned, no `as` cast
}
```

Or the **subclass** form, when you want to add fields of your own:

```ts
import { IsQueryFilter, OffsetParamsDto } from "@querykitjs/class-validator";
import type { Filter } from "@querykitjs/core";

class ListBuyersDto extends OffsetParamsDto {
  @IsOptional()
  @IsQueryFilter({ allowedKeys: ["buyerName", "createdAt", "status"] })
  declare filter?: Filter;
}
```

> `declare` matters: without it the property declaration shadows the inherited value.

Use `makeInfiniteParamsDto` / `makeCursorParamsDto` (or `InfiniteParamsDto` / `CursorParamsDto`) for the other modes.

## ⚠️ `ValidationPipe` settings

Both flags are **required**, otherwise the guarantees are only half in place:

| Flag              | Why                                                                                                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whitelist: true` | class-validator does not strip like zod does. Without it, `columns` / `with` / `withDeleted` **survive** on the client object and reach the repository. This flag removes properties that carry no decorator — the equivalent of zod's automatic stripping. |
| `transform: true` | `page`/`perPage`/`limit`/`offset` arrive as strings from a query string; `@Type(() => Number)` only runs when transform is on.                                                                                                                              |

## What it validates

- **Filter** — a flat array (`{key, operation, value}[]`) or a nested `and`/`or`/`not` tree.
- **Operators** — the full core set: `= != > >= < <=`, `like/ilike/notLike`, `contains/startsWith/endsWith` (+ tokens `%_%`/`%_`/`_%`), `in/notIn`, `between/notBetween`, `isNull/isNotNull`.
- **Sort** — `{ key, direction }[]` (multi-field).
- **Pagination** — offset (`page`/`perPage`), infinite (`limit`/`offset`), cursor (`limit`/`cursor`/`cursorKey`/`order`/`direction`).
- **Values** — a scalar or an array of scalars. Because the wire is JSON, a `Date` object, `NaN` and `Infinity` are **rejected** (dates arrive as ISO strings).
- **A field allowlist** (`allowedKeys`) and a **depth cap** (`maxDepth`) — neither exists in zod, see below.
- The legacy `type` field is **ignored** (not rejected) — easy migration.

## Safe by default

| Layer                              | Default behaviour                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `perPage` / `limit`                | Capped at core's `DEFAULT_MAX_PER_PAGE` / `DEFAULT_MAX_LIMIT` (200). `page` is uncapped — the DoS surface is page **size**, not page number.                                                                               |
| `columns` / `with` / `withDeleted` | Declared on no DTO, so `whitelist: true` strips them. Only `allow` opens them.                                                                                                                                             |
| `allowedKeys`                      | Omitted (`undefined`), any key passes — the allowlist is **opt-in** (zod parity). Provided, an unknown key is **rejected**; `[]` allows nothing, so an allowlist computed from an empty set fails closed rather than open. |
| `maxDepth`                         | `5`. An unbounded recursive tree is a DoS surface.                                                                                                                                                                         |

If you do open a field with `allow`, add the **second layer at the repository**: `forcedColumns` / `allowedColumns` ([drizzle-pg](../drizzle-pg/README.en.md) · [mongoose](../mongoose/README.en.md)).

## Options

`makeOffsetParamsDto` / `makeInfiniteParamsDto` / `makeCursorParamsDto`:

| Option        | Default                           | Meaning                                                     |
| ------------- | --------------------------------- | ----------------------------------------------------------- |
| `allowedKeys` | —                                 | Shared allowlist shorthand for `filter` and `sort`          |
| `filter`      | —                                 | Full options for `filter` (below) — wins over the shorthand |
| `sort`        | —                                 | `allowedKeys` / `messageStyle` for `sort`                   |
| `maxPerPage`  | core `DEFAULT_MAX_PER_PAGE` (200) | `perPage` ceiling. `Infinity` disables the cap (⚠️ DoS)     |
| `maxLimit`    | core `DEFAULT_MAX_LIMIT` (200)    | `limit` ceiling                                             |
| `allow`       | `[]`                              | Deliberately open `"columns"` / `"with"` / `"withDeleted"`  |

`@IsQueryFilter(options)` (and `options.filter`):

| Option             | Default                  | Meaning                                                                                    |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------------ |
| `allowedKeys`      | —                        | When set, an unknown filter key is rejected                                                |
| `allowedOperators` | every `FILTER_OPERATORS` | Narrow the accepted operator set                                                           |
| `maxDepth`         | `5`                      | `and`/`or`/`not` depth cap                                                                 |
| `strictValue`      | `false`                  | `in`/`notIn` → array, `between`/`notBetween` → two values, `isNull`/`isNotNull` → no value |
| `messageStyle`     | `"text"`                 | `"key"` returns the i18n key instead of a sentence                                         |
| `rootPath`         | the property name        | Root of the reported path (`filter[0].operation`)                                          |

`@IsQuerySort(options)` — `allowedKeys`, `messageStyle`, `rootPath`.

## i18n (more than one language)

The package identifies each message by **key**, so the number of languages is not limited. Every issue carries three things: `key` (translation key), `message` (ready-made text) and `args` (interpolation values).

With `messageStyle: "key"` the constraint returns the key instead of a sentence, and `nestjs-i18n` translates it into the request's language:

```ts
const ListBuyersDto = makeOffsetParamsDto({
  allowedKeys: ["buyerName"],
  filter: { messageStyle: "key" },
  sort: { messageStyle: "key" },
});

// main.ts
app.useGlobalPipes(new I18nValidationPipe({ transform: true, whitelist: true }));
```

Three catalogs ship in the box, so you don't write a translation file from scratch:

```ts
import { QUERYKIT_LOCALES, QUERYKIT_MESSAGES_UZ, formatMessage } from "@querykitjs/class-validator";

QUERYKIT_LOCALES; // { en, uz, ru }
formatMessage("querykit.filter.unknown_key", { path: "filter[0]", key: "zzz" }, QUERYKIT_MESSAGES_UZ);
// → "filter[0]: `zzz` ruxsat etilgan filter kaliti emas"
```

To add your own language, satisfy the `QueryKitMessageCatalog` type — when a key is added, TypeScript forces your catalog to be updated:

```ts
import type { QueryKitMessageCatalog } from "@querykitjs/class-validator";

const KK: QueryKitMessageCatalog = {
  "querykit.filter.unknown_key": "{path}: `{key}` рұқсат етілген кілт емес",
  // … every remaining key is required
};
```

## Without Nest — the pure core

`validateFilter` / `validateSort` are tied to no framework; they run under Express, Hono, or a plain function:

```ts
import { validateFilter, validateSort } from "@querykitjs/class-validator";

const issues = [...validateFilter(body.filter, { allowedKeys, strictValue: true }), ...validateSort(body.sort, { allowedKeys })];

if (issues.length > 0) {
  return res.status(400).json({ errors: issues }); // { path, key, message, args }
}
```

## Differences from `@querykitjs/zod`

|                          | `@querykitjs/zod` | `@querykitjs/class-validator`             |
| ------------------------ | ----------------- | ----------------------------------------- |
| Contract, operators      | from core         | **the same**                              |
| Stripping unknown fields | automatic         | via `ValidationPipe({ whitelist: true })` |
| Field allowlist          | none              | `allowedKeys`                             |
| Depth cap                | none              | `maxDepth` (default 5)                    |
| `NaN` / `Infinity`       | `Infinity` passes | both rejected (neither exists in JSON)    |
| i18n                     | —                 | `querykit.*` keys + en/uz/ru catalogs     |

## License

MIT © [Suhrobbek Soatov](https://soatov.uz)
