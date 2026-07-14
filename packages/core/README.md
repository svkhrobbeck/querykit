<div align="right">

[English](./README.en.md) · **O'zbekcha**

</div>

# @querykit/core

> querykit oilasi uchun umumiy, **ORM-agnostik** query DSL: filter tiplari, operatorlar, `createFilters` builder va wire-meta shakllari.

Bu paketni odatda **to'g'ridan-to'g'ri o'rnatmaysiz** — u `@querykit/drizzle-pg` (backend) va `@querykit/web` (frontend) tomonidan ishlatiladigan umumiy poydevor. Tiplar ustun-kaliti (`TKey`) bo'yicha generic; har bir adapter uni o'z kalit tipiga ixtisoslashtiradi (Drizzle jadval ustuni yoki entity maydoni).

## Ichida nima bor

- **`FilterOperator`** — barcha operatorlar: `= != > >= < <=` (+ `eq/ne/gt/gte/lt/lte`), `like/ilike/notLike`, `contains/startsWith/endsWith` (+ token `%_%`/`%_`/`_%`), `in/notIn`, `between/notBetween`, `isNull/isNotNull`.
- **Filter daraxti** — `FieldCondition<TKey>`, `AndGroup/OrGroup/NotGroup<TKey, TRaw>`, `FilterNode<TKey, TRaw>`, `Filter<TKey, TRaw>`. `TRaw` — adapter qo'shadigan raw escape-hatch (masalan Drizzle `SQL`; default `never`).
- **`FilterScalar` / `FilterValue`**, **`SortDirection`**.
- **`createFilters<TKey, TRaw>()`** + **`f`** — ergonomik builder (eq/ne/…, contains/…, like/ilike/notLike, in/notIn, between, range, isNull/isNotNull, and/or/not).
- **Wire meta** (server javobi, snake_case) — `OffsetMeta`, `InfiniteMeta`, `CursorMeta`.

## Foydalanish (adapter ichida)

```ts
import { createFilters } from "@querykit/core";
import type { Filter } from "@querykit/core";

// adapter o'z kalit tipiga ixtisoslashtiradi:
type MyFilter = Filter<"status" | "age", MyRawSql>;
const f = createFilters<"status" | "age", MyRawSql>();
f.and(f.eq("status", "active"), f.gte("age", 18));
```

## Litsenziya

MIT © Suhrobbek Soatov
