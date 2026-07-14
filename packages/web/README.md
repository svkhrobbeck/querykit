<div align="right">

[English](./README.en.md) · **O'zbekcha**

</div>

# @querykit/web

> Frontend uchun **tipli query-building**: filter/sort/pagination payloadini quradi, javob meta'sini map qiladi, URL-state sync beradi. **So'rov yubormaydi** — chiqqan payload'ni o'z `fetch`/`axios`ingizga uzatasiz.

React dashboardlar har list sahifasida bir xil boilerplate'ni qo'lda yozadi: `searchParams`'dan `IFilter[]` qurish, bo'sh filterlarni tashlash, `sortType` ↔ `{name,direction}`, "har o'zgarishda page-reset", meta snake→camel. `@querykit/web` shularni bartaraf qiladi. Payload querykit backend (`@querykit/drizzle-pg`) qabul qiladigan formatda.

```ts
import { buildListParams, f, mapMeta } from "@querykit/web";

const params = buildListParams({
  filter: f.and(f.contains("buyerName", search), f.eq("status", status)),
  sort: "-createdAt",
  page,
  perPage: 20,
});
const { data, meta } = (await http.post("/buyers/list", params)).data; // o'z axios/fetch
setMeta(mapMeta(meta));
```

## Imkoniyatlar

- **Ikkala filter uslubi** — `f.eq()...` builder VA object/massiv (`{key, operation, value}`). Legacy `IFilter[]` bilan to'liq mos.
- **Normalizatsiya** — bo'sh filterlarni prune, sort decode. Qiymatlar o'zgartirilmasdan o'tadi.
- **Declarative schema** — `defineListSchema` bilan URL param → filter; har sahifadagi qo'lda qurishni yo'q qiladi.
- **URL-state sync** — `searchParams` ↔ params, `sortType` encode/decode, page-reset. `searchParams` tashqaridan olinadi (router-agnostik).
- **React hook** — `useListParams` (peer `react`, `./react` subpath).
- **`mapMeta`** — snake→camel pagination meta.
- **Zero dependency** — axios/react-query/react-router/dayjs YO'Q. `react` faqat hook uchun ixtiyoriy peer.

## O'rnatish

```bash
bun add @querykit/web
# React hook uchun loyihangizda react bo'lishi kifoya (peer)
```

## Filter — ikkala uslub

```ts
import { createFilters } from "@querykit/web";
const f = createFilters<Buyer>(); // maydon nomi autocomplete

// 1) Builder
filter: f.and(f.contains("buyerName", s), f.eq("status", st));

// 2) Object/massiv (idistr kabi) — flat massiv = implicit AND
filter: [
  { key: "buyerName", operation: "%_%", value: s },
  { key: "status", operation: "=", value: st },
];
```

**Operatorlar:** `= != > >= < <=`, `%_%`/`contains`, `%_`/`startsWith`, `_%`/`endsWith`, `like`, `ilike`, `notLike`, `in`, `notIn`, `between`, `isNull`, `isNotNull` (querykit backend bilan bir xil to'plam). Builder helperlar: `f.eq/ne/gt/gte/lt/lte`, `f.contains/startsWith/endsWith`, `f.like/ilike/notLike`, `f.in/notIn`, `f.between`, `f.range` (sana diapazoni → ikki shart), `f.isNull/isNotNull`, `f.and/or/not`.

## Payload qurish

```ts
import { buildParams, buildListParams } from "@querykit/web";

const payload = buildListParams({
  filter, // builder yoki massiv
  sort: "-createdAt", // yoki { name, direction }
  page,
  perPage: 20,
  with: { supervisor: true }, // relations (default `with`)
});
// -> { filter:[...pruned], sort:{name,direction}, columns, with, page, perPage }
```

Bo'sh qiymatli filterlar tashlanadi (`""`/`null`/`undefined`/`[]`), lekin `0`/`false` saqlanadi. Qiymatlar o'zgartirilmasdan yuboriladi.

## Paginatsiya rejimlari (offset / infinite / cursor)

Backend'ning 3 rejimiga mos 3 builder. Har birining javob meta'si **har xil**, shuning uchun alohida mapper bor:

```ts
import { buildListParams, buildInfiniteParams, buildCursorParams, mapMeta, mapInfiniteMeta, mapCursorMeta } from "@querykit/web";

// 1) Offset — page / perPage
const p = buildListParams({ filter, page: 2, perPage: 20 });
mapMeta(res.meta); // { totalPages, totalCount, currentPage, perPage, hasNext, hasPrev }

// 2) Infinite — limit / offset
const p = buildInfiniteParams({ filter, limit: 20, offset: 40 });
mapInfiniteMeta(res.meta); // { limit, offset, count, hasMore, nextOffset }

// 3) Cursor — limit / cursor / order / direction (sort ishlatilmaydi)
const p = buildCursorParams({ filter, limit: 20, cursor, order: "asc" });
mapCursorMeta(res.meta); // { limit, hasNext, hasPrev, nextCursor, prevCursor }

// withDeleted — soft-delete'lilarni ham ko'rish
buildListParams({ filter, withDeleted: true });
```

## Declarative list schema

Har sahifada qo'lda `IFilter[]` qurish o'rniga bir marta e'lon qiling:

```ts
import { defineListSchema, searchParamsToPayload } from "@querykit/web";

const buyersSchema = defineListSchema({
  id: { operation: "=" },
  buyerName: { operation: "%_%", trim: true },
  status: { operation: "=" },
  createdAt: { range: ["fromDate", "toDate"] }, // → >= va <=
});

const params = searchParamsToPayload(buyersSchema, searchParams);
```

## React hook

```tsx
import { useSearchParams } from "react-router-dom"; // yoki boshqa manba
import { useListParams } from "@querykit/web/react";

function BuyersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { params, setParam, setPage, setSort } = useListParams({
    searchParams,
    setSearchParams,
    schema: buyersSchema,
  });

  const { data, meta } = useMyList(params); // o'z fetch/react-query

  // setParam("status", "active")  -> URL yangilanadi, page reset bo'ladi
  // setPage(2), setSort("-createdAt")
}
```

`searchParams` (`URLSearchParams`) va `setSearchParams` tashqaridan uzatiladi — kutubxona `react-router`ga bog'lanmaydi.

## So'rovni o'zingiz yuborasiz

Kutubxona faqat **so'rovgacha** ishlaydi. Transport yo'q:

```ts
// fetch
const res = await fetch("/api/buyers/list", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(params),
});
const { data, meta } = await res.json();

// axios
const { data } = await http.post("/buyers/list", params);
setMeta(mapMeta(data.meta));
```

## Boshqa / legacy backend (custom field nomlari)

Default querykit-canonical camelCase (`perPage`, `with`). Eski snake-backend (masalan idistr) uchun sozlang:

```ts
import { createQuery } from "@querykit/web";

const q = createQuery({ perPageField: "per_page", withField: "withPopulates" });
const params = q.list({ filter, page, perPage });
```

## API ma'lumotnoma

| Funksiya                                       | Vazifasi                               |
| ---------------------------------------------- | -------------------------------------- |
| `createFilters<T>()` / `f`                     | tipli filter builder / tipsiz          |
| `buildParams(input)`                           | params normalizatsiya (paginatsiyasiz) |
| `buildListParams(input)`                       | + `page`/`perPage` (offset)            |
| `buildInfiniteParams(input)`                   | + `limit`/`offset` (infinite)          |
| `buildCursorParams(input)`                     | + `limit`/`cursor`/`order`/`direction` |
| `createQuery(config)`                          | custom field nomlari bilan builder     |
| `defineListSchema(schema)`                     | URL param → filter tavsifi             |
| `schemaToFilter(schema, sp)`                   | searchParams → `FieldCondition[]`      |
| `searchParamsToPayload(schema, sp)`            | searchParams → to'liq payload          |
| `readListParams(schema, sp)`                   | searchParams → `ListParams`            |
| `setParam/setPage/setSize/setSort/resetParams` | URL yozish (immutable, page-reset)     |
| `encodeSort/decodeSort`                        | `{name,direction}` ↔ `"-createdAt"`    |
| `mapMeta(raw)`                                 | offset meta → camel                    |
| `mapInfiniteMeta(raw)`                         | infinite meta → camel                  |
| `mapCursorMeta(raw)`                           | cursor meta → camel                    |
| `useListParams(opts)` (`/react`)               | URL-sync hook                          |

## Ishlab chiqish

```bash
bun install
bun run typecheck
bun run lint
bun run build       # tsup -> dist (index + react, ESM + CJS + .d.ts)
bun run --filter @querykit/web test:smoke
```

## Litsenziya

MIT © Suhrobbek Soatov
