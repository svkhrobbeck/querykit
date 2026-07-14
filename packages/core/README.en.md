<div align="right">

**English** · [O'zbekcha](./README.md)

</div>

# @querykitjs/core

> Shared, **ORM-agnostic** query DSL for the querykit family: filter types, operators, the `createFilters` builder, and wire-meta shapes.

You usually **don't install this directly** — it's the shared foundation used by `@querykitjs/drizzle-pg` (backend) and `@querykitjs/web` (frontend). Types are generic over a key (`TKey`); each adapter specializes it to its own key type (a Drizzle table column or an entity field).

## What's inside

- **`FilterOperator`** — every operator: `= != > >= < <=` (+ `eq/ne/gt/gte/lt/lte`), `like/ilike/notLike`, `contains/startsWith/endsWith` (+ tokens `%_%`/`%_`/`_%`), `in/notIn`, `between/notBetween`, `isNull/isNotNull`.
- **Filter tree** — `FieldCondition<TKey>`, `AndGroup/OrGroup/NotGroup<TKey, TRaw>`, `FilterNode<TKey, TRaw>`, `Filter<TKey, TRaw>`. `TRaw` is an adapter-provided raw escape hatch (e.g. a Drizzle `SQL`; defaults to `never`).
- **`FilterScalar` / `FilterValue`**, **`SortDirection`**.
- **`createFilters<TKey, TRaw>()`** + **`f`** — ergonomic builder (eq/ne/…, contains/…, like/ilike/notLike, in/notIn, between, range, isNull/isNotNull, and/or/not).
- **Wire meta** (server response, snake_case) — `OffsetMeta`, `InfiniteMeta`, `CursorMeta`.

## Usage (inside an adapter)

```ts
import { createFilters } from "@querykitjs/core";
import type { Filter } from "@querykitjs/core";

// an adapter specializes it to its own key type:
type MyFilter = Filter<"status" | "age", MyRawSql>;
const f = createFilters<"status" | "age", MyRawSql>();
f.and(f.eq("status", "active"), f.gte("age", 18));
```

## License

MIT © Suhrobbek Soatov
