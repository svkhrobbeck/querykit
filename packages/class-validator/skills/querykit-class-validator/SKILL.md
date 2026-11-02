---
name: querykit-class-validator
description: Use when code validates a querykit list request with class-validator DTOs (@querykitjs/class-validator) - makeOffsetParamsDto / makeInfiniteParamsDto / makeCursorParamsDto, allowedKeys, maxDepth and limits, the allow option for columns / with / withDeleted, NestJS ValidationPipe settings, IsQueryFilter / IsQuerySort, i18n message catalogs (QUERYKIT_LOCALES), or validateFilter / validateSort without Nest.
---

## Safety rules

- DO build DTOs with the factories `makeOffsetParamsDto`, `makeInfiniteParamsDto`, `makeCursorParamsDto`. DON'T use the deprecated constant DTOs in new code.
- DO run Nest's `ValidationPipe` with `whitelist: true` and `transform: true`. Without `whitelist` the server-owned `columns`, `with` and `withDeleted` survive on the object and reach the repository; without `transform` numeric query-string fields stay strings.
- DON'T open `columns`, `with` or `withDeleted` by default. Only `allow: ["withDeleted"]` (or `"columns"`, `"with"`) opens one, on purpose, and the repository's `forcedColumns` / `allowedColumns` / `relations` still decide.
- DO pass `allowedKeys` (the filter and sort fields a client may name). An unknown key is then rejected, and `[]` allows nothing. Without it any key passes.
- DO keep `maxDepth` (default `5`) and the other request limits from core `DEFAULT_QUERY_LIMITS`: conditions `30`, array items `200`, string length `256`, offset `10000`, sort fields `3`. `perPage` and `limit` are capped at `200`. Raise one with `limits` on the factory. DON'T write your own size checks.
- DO treat the DTO as the first line only: the repository's `filterable` / `sortable` policy on the server is still the authority on which fields and operators a client may use.

## When to use

- A NestJS controller that receives the JSON body `@querykitjs/web` sends and passes it to a querykit repository.
- Express, Hono or any other framework with `validateFilter` / `validateSort` (no Nest, no decorators).
- Validation messages in more than one language (`en`, `ru`, `uz` catalogs, or your own).

With zod use `@querykitjs/zod`; the request contract is the same.

## Setup

```ts
import { makeOffsetParamsDto } from "@querykitjs/class-validator";

// main.ts: app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
export const ListBuyersDto = makeOffsetParamsDto({ allowedKeys: ["buyerName", "createdAt", "status"] });
export type ListBuyersDto = InstanceType<typeof ListBuyersDto>;

declare function findList(params: ListBuyersDto): Promise<{ data: unknown[] }>;

// @Post("list") list(@Body() params: ListBuyersDto) { … }
export const list = (params: ListBuyersDto) => findList(params); // core-aligned, no cast
```

## Common tasks

### Infinite scroll and cursor DTOs

```ts
import { makeCursorParamsDto, makeInfiniteParamsDto } from "@querykitjs/class-validator";

export const FeedDto = makeInfiniteParamsDto({ allowedKeys: ["status"], maxLimit: 50 }); // limit / offset
export const TimelineDto = makeCursorParamsDto({ allowedKeys: ["status"] }); // limit / cursor / cursorKey / order / direction
export type TimelineDto = InstanceType<typeof TimelineDto>;
```

### Add a field of your own with a decorator

```ts
import { IsOptional, IsString, MaxLength } from "class-validator";
import { makeOffsetParamsDto } from "@querykitjs/class-validator";

const BaseListDto = makeOffsetParamsDto({ allowedKeys: ["buyerName", "status"] });

export class ListBuyersDto extends BaseListDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  search?: string; // decorated, so whitelist: true keeps it
}
```

### Tighten the limits and the operators

```ts
import { makeOffsetParamsDto } from "@querykitjs/class-validator";

export const ReportDto = makeOffsetParamsDto({
  allowedKeys: ["status", "createdAt"],
  maxPerPage: 100,
  limits: { maxConditions: 10, maxInItems: 50 },
  filter: { maxDepth: 3, allowedOperators: ["=", "in", "between"], strictValue: true },
});
```

### Skip the count query with `withTotal`

```ts
import { makeOffsetParamsDto } from "@querykitjs/class-validator";

const ListDto = makeOffsetParamsDto({ allowedKeys: ["status"] });
const params: InstanceType<typeof ListDto> = { page: 3, perPage: 50, withTotal: false };
// withTotal: false ⇒ the repository runs no count; meta.total_items / total_pages are null
console.log(params.withTotal);
```

### Messages in the request's language

```ts
import { formatMessage, makeOffsetParamsDto, QUERYKIT_LOCALES, QUERYKIT_MESSAGES_UZ } from "@querykitjs/class-validator";

// messageStyle "key" returns i18n keys (for nestjs-i18n's I18nValidationPipe) instead of sentences
export const ListDto = makeOffsetParamsDto({ allowedKeys: ["buyerName"], filter: { messageStyle: "key" }, sort: { messageStyle: "key" } });

console.log(Object.keys(QUERYKIT_LOCALES)); // en, ru, uz
console.log(formatMessage("querykit.filter.unknown_key", { path: "filter[0]", key: "zzz" }, QUERYKIT_MESSAGES_UZ));
```

### Validate without Nest

```ts
import { validateFilter, validateSort } from "@querykitjs/class-validator";

declare const body: { filter?: unknown; sort?: unknown };
const allowedKeys = ["status", "createdAt"];

const issues = [...validateFilter(body.filter, { allowedKeys, strictValue: true }), ...validateSort(body.sort, { allowedKeys })];
if (issues.length > 0) console.log(issues.map(issue => `${issue.path}: ${issue.message}`)); // return 400 with { path, key, message, args }
```

## Request contract

The same JSON shape as every querykit package (`@querykitjs/core`): conditions `{ key, operation?, value? }`, groups `{ and }` / `{ or }` / `{ not }` (a flat array = AND), `sort` always `[{ key, direction? }]`, offset `page` / `perPage` / `withTotal`, infinite `limit` / `offset`, cursor `limit` / `cursor` / `cursorKey` / `order` / `direction` (no `sort`). Meta is snake_case: `total_items`, `total_pages`, `has_next`, `has_more`, `next_offset`, `next_cursor`, `prev_cursor`. The body types are `WireOffsetParams`, `WireInfiniteParams` and `WireCursorParams`; validate with `@querykitjs/zod` or `@querykitjs/class-validator`, then pass the body as is. Refusals are `QueryKitError` with `{ source, site, key, operation?, reason }`.

## Mistakes to avoid

- Using the deprecated constant DTOs `OffsetParamsDto`, `InfiniteParamsDto`, `CursorParamsDto`, `BaseParamsDto` in new code.
- Forgetting `whitelist: true` or `transform: true` on `ValidationPipe`.
- Overriding `filter` in a subclass without `declare`: the property declaration shadows the inherited value.
- Sending a `Date` object, `NaN` or `Infinity` as a filter value: the wire is JSON, so they are rejected; send ISO strings.
- Expecting `allowedKeys` to stop a field the repository allows: it only narrows the request; the repository's `filterable` is checked again on the server.
