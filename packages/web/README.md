<div align="right">

[English](./README.en.md) · **O'zbekcha**

</div>

# @querykitjs/web

[![npm](https://img.shields.io/npm/v/@querykitjs/web.svg)](https://www.npmjs.com/package/@querykitjs/web) [![license](https://img.shields.io/npm/l/@querykitjs/web.svg)](./LICENSE)

> Frontend uchun **tipli query-building**: filter/sort/pagination payloadini quradi, javob meta'sini map qiladi, URL-state sync beradi. **So'rov yubormaydi** — chiqqan payload'ni o'z `fetch`/`axios`ingizga uzatasiz. Zero-dependency.

React dashboardlar har list sahifasida bir xil boilerplate'ni qo'lda yozadi: `searchParams`'dan `IFilter[]` qurish, bo'sh filterlarni tashlash, `sortType` ↔ `[{key,direction}]` (ko'p-maydon), "har o'zgarishda page-reset", meta snake→camel. `@querykitjs/web` shularni bartaraf qiladi. Payload querykit backend (`@querykitjs/drizzle-pg`, mongoose adapter, ...) qabul qiladigan formatда.

```ts
// src/lib/query.ts — bir marta sozlang
import { createRegistry } from "@querykitjs/web";

export const qk = createRegistry({
  adapter: "drizzle-pg", // `with` intellisense'ini backend'ga moslaydi
  defaults: { perPage: 20, sort: ["-createdAt"] },
});
```

```tsx
// istalgan list sahifasi — butun boilerplate bir hookka jamlanadi
import { useQuery } from "@tanstack/react-query";
import { useListParams } from "@querykitjs/web/react";
import { qk } from "@/lib/query";

const users = qk.resource<IUser>("users");
const usersSchema = users.schema({ name: { operation: "%_%", trim: true }, status: { operation: "=" } });

function UsersPage() {
  const { params, setParam, setPage } = useListParams(users, { schema: usersSchema });
  const { data } = useQuery({
    queryKey: users.keys.list(params),
    queryFn: async () => users.parseList((await axios.post("/users/list", params)).data),
  });
  // data = { data: IUser[], meta: { totalPages, currentPage, hasNext, … } }
}
```

## Imkoniyatlar

- **Registry** — `adapter` + default'larni bir joyda sozlang, `resource<T>()` entity'ga tipli, adapter-aware builder/filter/schema/keys/parser beradi.
- **Ikkala filter uslubi** — `f.eq()...` builder (maydon tipiga qarab operator) VA object/massiv (`{key, operation, value}`). Legacy `IFilter[]` bilan to'liq mos.
- **3 pagination** — offset (`list`), infinite (`infinite`), cursor/keyset (`cursor`); har birining meta'si alohida `parse*` bilan camelCase'ga o'giriladi.
- **Adapter-aware `with`** — `mongoose`/`drizzle-pg`/`drizzle-sqlite`/`prisma-pg` uchun faqat **wire-safe** (JSON) relation opsiyalari intellisense'да; funksiya/SQL formalarи ko'rsatilmaydi.
- **Declarative schema** — `resource.schema` / `defineListSchema` bilan URL param → filter; har sahifadagi qo'lda qurishni yo'q qiladi.
- **React hook** — `useListParams` (`react-router-dom` ichida), `useListParamsBase` (router-agnostik). Core framework'siz — Vue ham shu core'ga bog'lanadi.
- **SSR** — `resource.fromSearchParams(sp, {schema})` hook'siz, `URLSearchParams`'dan to'g'ridan-to'g'ri payload.
- **Query keys** — `resource.keys` TanStack/SWR uchun barqaror kalitlar.
- **Zero dependency** — axios/react-query/dayjs YO'Q. `react` (+ hook uchun `react-router-dom`) ixtiyoriy peer.

## O'rnatish

```bash
bun add @querykitjs/web
# React hook uchun: react (peer). `useListParams` uchun qo'shimcha: react-router-dom (peer).
# Router-agnostik `useListParamsBase` react-router-dom talab qilmaydi.
```

## Ikki xil ishlatish

```ts
// (A) Registry — bir marta sozlang, entity-tipli + adapter-aware builder'lar
import { createRegistry } from "@querykitjs/web";

// (B) Standalone — free-form, doim mavjud
import { buildListParams, f } from "@querykitjs/web";
```

(A)ни — default'lar bir joyda, autocomplete, adapter `with`, query keys, meta parsing kerak bo'lsa. (B)ни — bir martalik/free-form qurish uchun.

## `createRegistry(config)` — bir marta sozlash

```ts
export const qk = createRegistry({
  adapter: "mongoose", // "mongoose" | "drizzle-pg" | "drizzle-sqlite" | "prisma-pg"
  defaults: {
    perPage: 20, // list (offset) sahifa hajmi
    limit: 20, // infinite + cursor hajmi
    sort: ["-createdAt"], // list + infinite tartibi (boshidagi "-" = desc)
    cursor: { order: "asc" }, // faqat cursor: kalit bo'ylab yurish tartibi
  },
  pruneEmpty: true, // bo'sh filterlarni tashlash (""/null/undefined/[]); 0/false qoladi
});
```

| Config                  | Vazifasi                                                                          |
| ----------------------- | --------------------------------------------------------------------------------- |
| `adapter`               | Backend turi — `with` tipini moslaydi (faqat intellisense).                       |
| `defaults.perPage`      | `list` uchun default `perPage`.                                                   |
| `defaults.limit`        | `infinite` va `cursor` uchun default `limit`.                                     |
| `defaults.sort`         | `list`/`infinite` default sort — `[{key,direction}]` yoki `["-field"]` shorthand. |
| `defaults.cursor.order` | Default cursor tartibi (`"asc"`/`"desc"`).                                        |
| `pruneEmpty`            | Form input'lardan qurilgan bo'sh filterlarni avtomatik tashlash (default `true`). |

Har bir default har chaqiriqда override qilinadi.

## `qk.resource<TEntity>(name)` — entity qatlami

```ts
import type { IUser } from "@my/api-types";
export const users = qk.resource<IUser>("users"); // "users" = cache-key namespace (majburiy, unikal)
```

| A'zo                                                           | Nima                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `users.list(input)`                                            | offset (page) payload quradi                                           |
| `users.infinite(input)`                                        | infinite (limit/offset) payload quradi                                 |
| `users.cursor(input)`                                          | cursor (keyset) payload quradi                                         |
| `users.params(input)`                                          | pagination'siz payload (filter/sort/columns/with)                      |
| `users.f`                                                      | `createFilters<IUser>()` — maydon-tipli builder                        |
| `users.search(term, fields)`                                   | ko'p maydon bo'ylab OR-of-`contains` preset                            |
| `users.schema(desc)`                                           | `defineListSchema` bog'langan (URL ↔ filter)                           |
| `users.fromSearchParams(sp, {schema})`                         | `URLSearchParams`'dan to'g'ridan-to'g'ri list payload (SSR / hook'siz) |
| `users.keys`                                                   | TanStack/SWR uchun barqaror query keys                                 |
| `users.parseList / parseInfinite / parseCursor`                | javob meta'sini snake→camel                                            |
| `ListResult<T> / InfiniteResult<T> / CursorResult<T>` (tiplar) | `parse*` qaytaradigan tiplar                                           |

Barcha builder'lar registry'ning `defaults` + `pruneEmpty`ini meros oladi; tiplar `IUser` va `adapter`dan kelib chiqadi.

> URL setter'lar (`setParam`/`setPage`/`setSort`/`reset`) config'siz — standalone `url` helper'lar yoki `useListParams` hook orqali. `users.url` yo'q.

## Filter — `f` (maydon-tipli) va object/massiv

```ts
import { createFilters } from "@querykitjs/web";
const f = createFilters<Buyer>(); // yoki: const f = users.f;

// 1) Builder — maydon nomi autocomplete + maydon tipiga qarab operator
filter: f.and(f.contains("buyerName", s), f.eq("status", st));

// 2) Object/massiv (idistr kabi) — flat massiv = implicit AND
filter: [
  { key: "buyerName", operation: "%_%", value: s },
  { key: "status", operation: "=", value: st },
];
```

**Operator-per-field-type:** `f.contains`/`like`/`ilike`/`startsWith`/... faqat **string** maydonlarга, `f.gt`/`gte`/`between`/... **taqqoslanadigan** (string/number/Date) maydonlarга taklif qilinadi:

```ts
f.contains("buyerName", s); // ✓ buyerName: string
f.gte("age", 18); // ✓ age: number
f.contains("age", "x"); // ✗ compile-error — `contains` string-only
```

**Operatorlar:** `= != > >= < <=`, `%_%`/`contains`, `%_`/`startsWith`, `_%`/`endsWith`, `like`, `ilike`, `notLike`, `in`, `notIn`, `between`, `isNull`, `isNotNull`. Builder helperlar: `f.eq/ne/gt/gte/lt/lte`, `f.contains/startsWith/endsWith`, `f.like/ilike/notLike`, `f.in/notIn`, `f.between`, `f.range` (diapazon → ikki shart), `f.isNull/isNotNull`, `f.and/or/not`.

**`search` preset** — bitta input, ko'p ustun (OR of contains):

```ts
users.search("ali", ["buyerName", "email"]);
// → or(contains("buyerName","ali"), contains("email","ali"))
```

Tipsiz `f` ham bor: `import { f } from "@querykitjs/web"` (maydon-tip tekshiruvisiz, tez ishlatish).

## Sort — hamisha `[{ key, direction }]` (ko'p-maydon)

Sort **hamisha** `{ key, direction }` elementlar massivi — butun querykit stеки bo'ylab (frontend + har bir backend adapter) bir xil shakl.

```ts
// canonical
users.list({ sort: [{ key: "createdAt", direction: "desc" }] });

// ko'p-maydon — ORDER BY name ASC, createdAt DESC
users.list({ sort: [{ key: "name" }, { key: "createdAt", direction: "desc" }] });

// shorthand — builder `"-field"` / `"field"` string'larни o'zi maplaydi
users.list({ sort: ["-createdAt", "name"] }); // → [{ key:"createdAt", direction:"desc" }, { key:"name", direction:"asc" }]
```

**URL round-trip.** `setSort` bitta vergul bilan ajratilgan `sortType` param'ga kodlaydi; o'qiganда yana massivga dekodlanadi — ko'p-sort URL'да saqlanadi:

```ts
setSort(searchParams, ["-createdAt", "id"]); // ?sortType=-createdAt,id
decodeSort("-createdAt,id"); // → [{ key:"createdAt", direction:"desc" }, { key:"id", direction:"asc" }]
```

**Backend faqat** canonical `[{ key, direction }]`ни oladi — `"-field"` shorthand frontend'да resolve qilinadi, wire'га hech qачон yuborilmaydi.

## Builder'lar — kirish va **nima qaytaradi**

Bular **sof, sinxron** funksiyalar. **Payload obyekt** qaytaradi (Promise emas, data emas). O'zingiz yuborasiz.

```ts
// list — offset (page)
users.list({ filter?, sort?, columns?, with?, withDeleted?, page?, perPage? });
// → { filter, sort: [{ key, direction }], columns, with, page, perPage, withDeleted? }

// infinite — limit/offset
users.infinite({ filter?, sort?, columns?, with?, withDeleted?, limit?, offset? });
// → { filter, sort, columns, with, limit, offset }

// cursor — sort YO'Q, order + direction ishlatiladi
users.cursor({ filter?, columns?, with?, withDeleted?, limit?, cursor?, order?, direction?, cursorKey? });
// → { filter, columns, with, limit, cursor, order, direction, cursorKey? }
```

Bo'sh qiymatli filterlar tashlanadi (`""`/`null`/`undefined`/`[]`), lekin `0`/`false` saqlanadi. Qiymatlar o'zgartirilmasdan yuboriladi.

## Paginatsiya + `parse*` (meta)

Backend'ning 3 rejimiga mos 3 builder. Har birining javob meta'si **har xil** (wire'да snake_case), shuning uchun alohida parser:

| Builder    | Backend qaytaradi                                                                          | `parse*` → camelCase                                                 |
| ---------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `list`     | `{ data, meta: { total_items, total_pages, current_page, per_page, has_next, has_prev } }` | `{ totalCount, totalPages, currentPage, perPage, hasNext, hasPrev }` |
| `infinite` | `{ data, meta: { limit, offset, count, has_more, next_offset } }`                          | `{ limit, offset, count, hasMore, nextOffset }`                      |
| `cursor`   | `{ data, meta: { limit, has_next, has_prev, next_cursor, prev_cursor } }`                  | `{ limit, hasNext, hasPrev, nextCursor, prevCursor }`                |

```ts
const r = users.parseList(res.data); // { data: IUser[], meta: { totalPages, currentPage, hasNext, … } }
users.parseInfinite(res.data); // { data, meta: { hasMore, nextOffset, … } }
users.parseCursor(res.data); // { data, meta: { nextCursor, hasNext, … } }
```

`parse*` ikki darajaда bor (bitta umumiy implementatsiya — meta entity-agnostik):
`qk.parseList/...` (registry, `data: unknown[]`) — `resource` bo'lmasa; `users.parseList/...` (entity'ga tipli).

## Adapter-aware, wire-safe `with`

Registry `with`ni adapter bo'yicha tiplaydi — **faqat serializable** opsiyalar:

| adapter                         | `with[rel]` intellisense                                           | Ko'rsatilmaydi                                    |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| `mongoose`                      | `boolean \| { select?, populate?, match?, options? }`              | —                                                 |
| `drizzle-pg` / `drizzle-sqlite` | `boolean \| { columns?, with?, limit?, offset? }`                  | `where:(f,op)=>…`, `orderBy:(f,op)=>…`, raw `sql` |
| `prisma-pg`                     | `boolean \| { select?, include?, where?, orderBy?, take?, skip? }` | funksiya formalar                                 |

```ts
// adapter: "mongoose"
users.list({ with: { author: { select: "name email" } } }); // ✓ `select`
// adapter: "drizzle-pg"
users.list({ with: { author: { columns: { name: true } } } }); // ✓ `columns`; `where`-fn yashirin
```

Runtime o'zgarmaydi (pass-through) — bu sof DX. Funksiya/SQL formalarини JSON'да yubora olmaganingiz uchun ular umuman taklif qilinmaydi.

## Declarative list schema — URL ↔ filter

Har sahifada qo'lда `IFilter[]` qurish o'rniga bir marta e'lon qiling. `useListParams` (va `schemaToFilter`) uni qo'llaydi: har param'ni o'qiydi, operatsiyani bajaradi, bo'shlarni tashlaydi, default'ларни to'ldiradi.

```ts
const dispatchesSchema = dispatches.schema({
  id: { operation: "=" },
  status: { operation: "=", default: "active" }, // ?status yo'q → "active"
  productIds: { operation: "in", split: "," }, // ?productIds=1,2,3 → in [1,2,3]
  q: { search: ["name", "imei", "appNumber"] }, // ?q=… → contains-OR ko'p maydon
  name: { operation: "%_%", trim: true }, // qiymatni trim qiladi
  createdAt: { range: ["fromDate", "toDate"] }, // ikki param → >= va <= (inclusive)
  // price:   { between: ["minPrice", "maxPrice"] },      // YOKI: bitta `between` shart (2-tuple)
});
```

### FieldDescriptor rejimlari

| Kalit                 | Ma'nosi                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operation`           | filter operatsiyasi (`"="`, `"%_%"`, `"in"`, …). **Aniq** — `true` shorthand yo'q.                                                                                   |
| `default`             | URL param **yo'q** bo'lganда ishlatiladigan qiymat (qo'lda `\|\| "active"`ni almashtiradi).                                                                          |
| `split`               | massiv operatsiyalar (`in`/`notIn`) uchun: comma-string'ni massivga bo'ladi (default `","`). **Guarded** — yo'q/bo'sh → tashlanadi (hech qachon `[undefined]` emas). |
| `range: [from, to]`   | ikki param → **ikki inclusive** shart (`>= from`, `<= to`); har chegara mustaqil.                                                                                    |
| `between: [from, to]` | ikki param → **bitta** `between` shart (2-tuple). **Ikkала chegара kerak** — bir tomonli → hech nima (mustaqil chegara uchun `range`).                               |
| `trim`                | string qiymatni trim qiladi.                                                                                                                                         |
| `search: [fields]`    | bitta param → sanab o'tilган maydonlar bo'yicha `contains`-OR.                                                                                                       |

**Har descriptor'га aynan bitta rejim** — Simple (`operation` + `trim`/`default`/`split`), `range`, `between`, `search` **o'zaro eksklyuziv** va compile-time'да majburlanadi (masalan `range` + `search` aralashsa — tip xato).

Bo'sh/**yo'q** paramlar tashlanadi; `default` faqat param **yo'q** bo'lganда to'ldiradi (bo'sh `?x=` = "tozalangan" → tashlanadi, default emas).

## React hook

```tsx
import { useListParams } from "@querykitjs/web/react"; // react-router-dom ichida ishlatiladi
import { qk } from "@/lib/query";

const users = qk.resource<IUser>("users");
const usersSchema = users.schema({ name: { operation: "%_%", trim: true }, status: { operation: "=" } });

function UsersListPage() {
  // ?page/?size/?sortType/?name/... ni URL'дан o'qiydi (ichида useSearchParams)
  const { params, setParam, setPage, setSort, reset } = useListParams(users, {
    schema: usersSchema,
    with: { manager: true }, // qat'iy relation'lar (URL'дан emas)
  });

  const q = useQuery({
    queryKey: users.keys.list(params),
    queryFn: async () => users.parseList((await axios.post("/users/list", params)).data),
    placeholderData: prev => prev, // yuklanayotganда oldingi sahifani ushlab turadi
  });

  // setParam("status","active") → URL yangilanadi, page reset; setPage(2); setSort("-createdAt")
}
```

Input/sort/page o'zgarishi URL'ni o'zgartiradi → `params` o'zgaradi → `queryKey` o'zgaradi → TanStack qayta so'raydi (va har kombinatsiyani cache qiladi).

**Router-agnostik** (Next.js, TanStack Router) — base hook'ga `searchParams` bering (`react-router-dom` talab qilmaydi):

```tsx
import { useListParamsBase } from "@querykitjs/web/react";
const { params, setPage } = useListParamsBase(users, { schema: usersSchema, searchParams, setSearchParams });
```

## SSR — `fromSearchParams` (hook'siz)

Server component / `getServerSideProps` uchun — URL'дан to'g'ridan-to'g'ri payload:

```ts
// Next.js server component
export default async function Page({ searchParams }) {
  const sp = new URLSearchParams(searchParams);
  const body = users.fromSearchParams(sp, { schema: usersSchema });
  const res = await fetch(`${API}/users/list`, { method: "POST", body: JSON.stringify(body) });
  const { data, meta } = users.parseList(await res.json());
}
```

## Query keys — `users.keys`

TanStack Query / SWR cache uchun barqaror, strukturaли kalitlar:

```ts
users.keys.all; // ["users"]
users.keys.list(payload); // ["users", "list", payload]
users.keys.infinite(payload); // ["users", "infinite", payload]
users.keys.cursor(payload); // ["users", "cursor", payload]
users.keys.detail(id); // ["users", "detail", id]
```

## To'liq misollar

### axios — offset / infinite / cursor

```ts
import { qk } from "@/lib/query";
const users = qk.resource<IUser>("users");

// offset
const listRes = await axios.post("/users/list", users.list({ filter: users.f.eq("status", "active"), page }));
const { data, meta } = users.parseList(listRes.data); // meta.currentPage, meta.totalPages…

// infinite
const infRes = await axios.post("/users/infinite", users.infinite({ limit: 20, offset }));
const inf = users.parseInfinite(infRes.data); // inf.meta.hasMore, inf.meta.nextOffset

// cursor
const curRes = await axios.post("/users/cursor", users.cursor({ limit: 20, cursor }));
const cur = users.parseCursor(curRes.data); // cur.meta.nextCursor, cur.meta.hasNext
```

### TanStack `useQuery` (offset)

```tsx
import { useQuery } from "@tanstack/react-query";
const users = qk.resource<IUser>("users");

function useUsers(filters: { status?: string; search?: string }, page: number) {
  const body = users.list({
    filter: [users.f.eq("status", filters.status), users.f.contains("name", filters.search)],
    sort: ["-createdAt"],
    page,
  });
  return useQuery({
    queryKey: users.keys.list(body), // barqaror cache kaliti
    queryFn: async () => users.parseList((await axios.post("/users/list", body)).data),
  });
  // data = { data: IUser[], meta: { totalPages, currentPage, hasNext, … } }
}
```

### Infinite scroll — `useInfiniteQuery`

```tsx
import { useInfiniteQuery } from "@tanstack/react-query";
const feed = qk.resource<IPost>("feed");

function useFeed(filter: IPostFilterInput) {
  return useInfiniteQuery({
    queryKey: feed.keys.infinite({ filter }),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => feed.parseInfinite((await axios.post("/feed/infinite", feed.infinite({ filter, offset: pageParam, limit: 20 }))).data),
    getNextPageParam: last => (last.meta.hasMore ? last.meta.nextOffset : undefined),
  });
  // const rows = data?.pages.flatMap(p => p.data) ?? [];
}
```

### Cursor (keyset) — `useInfiniteQuery`, ikki tomonlама

```tsx
const feed = qk.resource<IPost>("feed");

function useCursorFeed(filter: IPostFilterInput) {
  return useInfiniteQuery({
    queryKey: feed.keys.cursor({ filter }),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, direction }) =>
      feed.parseCursor(
        (
          await axios.post(
            "/feed/cursor",
            feed.cursor({
              filter,
              cursor: pageParam,
              limit: 20,
              order: "asc", // barqaror feed tartibi
              direction: direction === "backward" ? "backward" : "forward",
            }),
          )
        ).data,
      ),
    getNextPageParam: last => (last.meta.hasNext ? last.meta.nextCursor : undefined),
    getPreviousPageParam: first => (first.meta.hasPrev ? first.meta.prevCursor : undefined),
  });
}
```

`order` — barqaror feed tartibi (konstant); TanStack'ning forward/backward'i payload'ning `direction`iga o'giriladi, cursor tokenlari (`nextCursor`/`prevCursor`) map qilingan meta'дан keladi.

## Standalone (registry'siz) — free-form

Registry shart emas — builder'lar to'g'ridan-to'g'ri ishlaydi:

```ts
import { buildListParams, buildInfiniteParams, buildCursorParams, f } from "@querykitjs/web";

const body = buildListParams({
  filter: f.and(f.contains("name", search), f.eq("status", status)),
  sort: ["-createdAt"],
  page,
  perPage: 20,
  with: { supervisor: true },
});
const res = await axios.post("/users/list", body);
const { data, meta } = qk.parseList(res.data); // meta uchun registry parse* (entity-agnostik)
```

`createQuery(config)` — registry'siz default'lar/`pruneEmpty` kerak bo'lsa. Wire maydon nomlari querykit kontrakti bilan qat'iy (`filter`/`sort`/`columns`/`with`/`page`/`perPage`/`limit`/`offset`/`cursor`/`withDeleted`).

```ts
import { createQuery } from "@querykitjs/web";
const q = createQuery({ defaultPerPage: 20, pruneEmpty: true });
const params = q.list({ filter, page });
```

## So'rovni o'zingiz yuborasiz

Kutubxona faqat **so'rovgacha** ishlaydi. Transport yo'q:

```ts
const res = await fetch("/api/users/list", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(params),
});
const { data, meta } = users.parseList(await res.json());
```

## API ma'lumotnoma

| Funksiya / a'zo                                                                   | Vazifasi                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `createRegistry(config)`                                                          | adapter + default'lar bilan registry                   |
| `registry.resource<T>(name)`                                                      | entity-tipli builder/filter/schema/keys/parser         |
| `resource.list/infinite/cursor/params(input)`                                     | payload qurish (offset/infinite/cursor/pagination'siz) |
| `resource.f` / `createFilters<T>()` / `f`                                         | tipli filter builder / tipli / tipsiz                  |
| `resource.search(term, fields)`                                                   | OR-of-contains preset                                  |
| `resource.schema(desc)` / `defineListSchema(desc)`                                | URL param → filter tavsifi                             |
| `resource.fromSearchParams(sp, {schema})`                                         | searchParams → list payload (SSR)                      |
| `resource.keys`                                                                   | TanStack/SWR query keys                                |
| `resource.parseList/parseInfinite/parseCursor`                                    | javob meta'sini camelCase                              |
| `qk.parseList/parseInfinite/parseCursor`                                          | registry-level parse (entity-agnostik)                 |
| `buildParams / buildListParams / buildInfiniteParams / buildCursorParams`         | standalone builder'lar                                 |
| `createQuery(config)`                                                             | registry'siz builder (default'lar/pruneEmpty)          |
| `schemaToFilter(schema, sp)`                                                      | searchParams → `FieldCondition[]`                      |
| `searchParamsToPayload(schema, sp)`                                               | searchParams → to'liq payload                          |
| `readListParams(schema, sp)`                                                      | searchParams → `ListParams`                            |
| `setParam/setPage/setSize/setSort/resetParams`                                    | URL yozish (immutable, page-reset)                     |
| `encodeSort/decodeSort`                                                           | `[{key,direction}]` ↔ `"-createdAt,id"` (multi-field)  |
| `useListParams(resource, {schema})` (`/react`)                                    | URL-sync hook (react-router-dom)                       |
| `useListParamsBase(resource, {schema, searchParams, setSearchParams})` (`/react`) | router-agnostik hook                                   |

## Ishlab chiqish

```bash
bun install
bun run typecheck
bun run lint
bun run build       # tsup -> dist (index + react, ESM + CJS + .d.ts)
bun run --filter @querykitjs/web test:smoke
```

## Litsenziya

MIT © Suhrobbek Soatov
