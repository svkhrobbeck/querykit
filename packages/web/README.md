<div align="right">

[English](./README.en.md) · **O'zbekcha**

</div>

# @querykit/web

> Frontend uchun **tipli query-building**: filter/sort/pagination payloadini quradi, javob meta'sini map qiladi, URL-state sync beradi. **So'rov yubormaydi** — chiqqan payload'ni o'z `fetch`/`axios`ingizga uzatasiz.

React dashboardlar har list sahifasida bir xil boilerplate'ni qo'lda yozadi: `searchParams`'dan `IFilter[]` qurish, filter normalizatsiya + tip coercion (sana ISO), bo'sh filterlarni tashlash, `sortType` ↔ `{name,direction}`, "har o'zgarishda page-reset", meta snake→camel. `@querykit/web` shularni bartaraf qiladi. Payload querykit backend (`@querykit/drizzle-pg`) qabul qiladigan formatda.

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

- **Ikkala filter uslubi** — `f.eq()...` builder VA object/massiv (`{key, operation, value, type}`). Legacy `IFilter[]` bilan to'liq mos.
- **Normalizatsiya** — tip coercion (sana→ISO, number, boolean, massiv), bo'sh filterlarni prune, sort decode.
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

**Operatorlar:** `= != > >= < <=`, `%_%` (contains), `%_` (startsWith), `_%` (endsWith), `in`, `notIn`, `between`, `isNull`, `isNotNull`. Sana diapazoni: `f.range("createdAt", from, to, "date")` yoki ikki shart `>=`/`<=`.

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
// -> { filter:[...coerced+pruned], sort:{name,direction}, columns, with, page, per_page }
```

Bo'sh qiymatli filterlar tashlanadi (`""`/`null`/`undefined`/`[]`), lekin `0`/`false` saqlanadi. `type` bo'yicha coerce qilinadi (sana ISO'ga).

## Declarative list schema

Har sahifada qo'lda `IFilter[]` qurish o'rniga bir marta e'lon qiling:

```ts
import { defineListSchema, searchParamsToPayload } from "@querykit/web";

const buyersSchema = defineListSchema({
  id: { operation: "=" },
  buyerName: { operation: "%_%", trim: true },
  status: { operation: "=" },
  createdAt: { type: "date", range: ["fromDate", "toDate"] }, // → >= va <=
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

## Boshqa backend (custom field nomlari)

```ts
import { createQuery } from "@querykit/web";

const q = createQuery({ withField: "withPopulates", perPageField: "perPage", defaultPerPage: 20 });
const params = q.list({ filter, page, perPage });
```

## API ma'lumotnoma

| Funksiya                                       | Vazifasi                               |
| ---------------------------------------------- | -------------------------------------- |
| `createFilters<T>()` / `f`                     | tipli filter builder / tipsiz          |
| `buildParams(input)`                           | params normalizatsiya (paginatsiyasiz) |
| `buildListParams(input)`                       | + `page`/`per_page`                    |
| `createQuery(config)`                          | custom field nomlari bilan builder     |
| `defineListSchema(schema)`                     | URL param → filter tavsifi             |
| `schemaToFilter(schema, sp)`                   | searchParams → `FieldCondition[]`      |
| `searchParamsToPayload(schema, sp)`            | searchParams → to'liq payload          |
| `readListParams(schema, sp)`                   | searchParams → `ListParams`            |
| `setParam/setPage/setSize/setSort/resetParams` | URL yozish (immutable, page-reset)     |
| `encodeSort/decodeSort`                        | `{name,direction}` ↔ `"-createdAt"`    |
| `mapMeta(raw)`                                 | snake → camel meta                     |
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
