<div align="right">

[English](./README.en.md) · **O'zbekcha**

</div>

# @querykitjs/core

> querykit oilasi uchun umumiy, **ORM-agnostik** query DSL: filter tiplari, operatorlar, `createFilters` builder va wire-meta shakllari.

Bu paketni odatda **to'g'ridan-to'g'ri o'rnatmaysiz** — u `@querykitjs/drizzle-pg` (backend) va `@querykitjs/web` (frontend) tomonidan ishlatiladigan umumiy poydevor. Tiplar ustun-kaliti (`TKey`) bo'yicha generic; har bir adapter uni o'z kalit tipiga ixtisoslashtiradi (Drizzle jadval ustuni yoki entity maydoni).

## Ichida nima bor

- **`FilterOperator`** — barcha operatorlar: `= != > >= < <=` (+ `eq/ne/gt/gte/lt/lte`), `like/ilike/notLike`, `contains/startsWith/endsWith` (+ token `%_%`/`%_`/`_%`), `in/notIn`, `between/notBetween`, `isNull/isNotNull`.
- **Filter daraxti** — `FieldCondition<TKey>`, `AndGroup/OrGroup/NotGroup<TKey, TRaw>`, `FilterNode<TKey, TRaw>`, `Filter<TKey, TRaw>`. `TRaw` — adapter qo'shadigan raw escape-hatch (masalan Drizzle `SQL`; default `never`).
- **`FilterScalar` / `FilterValue`**, **`SortDirection`**.
- **`createFilters<TKey, TRaw>()`** + **`f`** — ergonomik builder (eq/ne/…, contains/…, like/ilike/notLike, in/notIn, between, range, isNull/isNotNull, and/or/not).
- **Wire meta** (server javobi, snake_case) — `OffsetMeta`, `InfiniteMeta`, `CursorMeta`.
- **`Filterable`** va skip/rad etish sabablari (`SkipReason`: `unknown-key`, `invalid-value`, `forbidden-key`, `forbidden-operator`, `limit-exceeded`, `empty-filter`; `SkipSite` + `page`, `mutation`) — siyosat sabablari va bo'sh mutatsiya filtri hech qachon jim tashlanmaydi, har doim `QueryKitError`.
- **`QueryKitTimeoutError`** (`code: "QUERYKIT_TIMEOUT"`) — o'qish vaqt chegarasidan oshdi (mongoose `maxTimeMS`). `QueryKitError`dan alohida: so'rov to'g'ri, baza sekin — 503/504 qiling.
- **`raw(value)`** — drayverning o'z filtr obyekti (Prisma `where`, Mongo filtri) uchun brend (R19). Adapter raw tugunni faqat `raw()` bilan belgilangan bo'lsa qabul qiladi; brendsiz oddiy obyekt (JSON body'dan kelishi mumkin) → `QueryKitError` `forbidden-key`. ⚠️ Raw tugun — server kodi, `filterable` uni tekshirmaydi; uni hech qachon so'rov ma'lumotidan qurmang.
- **So'rov limitlari** — `QueryLimits`, `DEFAULT_QUERY_LIMITS`, `resolveLimits(partial)` va alohida konstantalar (pastdagi jadval).

- **`@querykitjs/core/internal`** — **faqat adapter va validator yozuvchilar uchun**: cursor tokenlari, skip diagnostikasi, har chaqiruv uchun repository konteksti, sort normalizatsiyasi, pagination meta'lari, limit tekshiruvi (`findFilterLimitViolation`) va so'rov siyosati (`resolvePolicy`: `filterable` / `sortable` / `limits`) — hamma querykit paketlari uchun umumiy. Ilova API'si emas; minor relizda o'zgarishi mumkin.

## Limits

Har filtr va paginatsiya so'rovi parse paytida hajm bo'yicha chegaralanadi. `@querykitjs/zod` va `@querykitjs/class-validator` limitdan oshgan payload'ni rad etadi; `@querykitjs/web` offset va sort limitidan oshgan payload'ni yasamaydi.

| Limit              | Konstanta                    | Default  | Nima sanaladi                                                                               |
| ------------------ | ---------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `maxDepth`         | `DEFAULT_MAX_FILTER_DEPTH`   | `5`      | ildizdan bargacha tugunlar: ildiz 1, har `and`/`or`/`not` va shart +1                       |
| `maxConditions`    | `DEFAULT_MAX_CONDITIONS`     | `30`     | barcha guruhlardagi `FieldCondition` barglari                                               |
| `maxInItems`       | `DEFAULT_MAX_IN_ITEMS`       | `200`    | bitta massiv qiymatdagi elementlar (`in`, `notIn`, …)                                       |
| `maxStringLength`  | `DEFAULT_MAX_STRING_LENGTH`  | `256`    | bitta satr qiymatdagi belgilar (massiv ichida ham)                                          |
| `maxOffset`        | `DEFAULT_MAX_OFFSET`         | `10 000` | offset: `(page - 1) × perPage`; infinite: `offset`. Chuqurrog'i — cursor                    |
| `maxSortFields`    | `DEFAULT_MAX_SORT_FIELDS`    | `3`      | `sort` massividagi maydonlar                                                                |
| `maxLikeWildcards` | `DEFAULT_MAX_LIKE_WILDCARDS` | `2`      | bitta `like`/`ilike`/`notLike` naqshidagi `%`/`_` (ketma-ket `%%` bitta) — adapter siyosati |

```ts
import { resolveLimits } from "@querykitjs/core";

resolveLimits({ maxInItems: 500 }); // qolgan beshtasi — default
```

Limitni bitta schema/DTO uchun `limits` opsiyasi bilan oshiring; `Infinity` limitni o'chiradi (⚠️ DoS yuzasi).

## Foydalanish (adapter ichida)

```ts
import { createFilters } from "@querykitjs/core";
import type { Filter } from "@querykitjs/core";

// adapter o'z kalit tipiga ixtisoslashtiradi:
type MyFilter = Filter<"status" | "age", MyRawSql>;
const f = createFilters<"status" | "age", MyRawSql>();
f.and(f.eq("status", "active"), f.gte("age", 18));
```

### Talablar

|         | Versiya   | Tekshiriladi (`bun run test:matrix`) |
| ------- | --------- | ------------------------------------ |
| Node.js | `>=22.12` | 24                                   |

Node 20 endi qo'llab-quvvatlanmaydi (`engines`: `>=22.12`). Peer diapazoni — oxirgi ikki major; ikkala cheti testda.

## Litsenziya

MIT © Suhrobbek Soatov
