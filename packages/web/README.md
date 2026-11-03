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
- **Adapter-aware `with`** — `mongoose`/`drizzle-pg`/`drizzle-sqlite`/`prisma-pg` uchun faqat **wire-safe** (JSON) relation opsiyalari intellisense'da; funksiya/SQL formalari ko'rsatilmaydi. `mongodb` da `with` yo'q — relation'larni ikkinchi so'rov bilan yuklang.
- **Declarative schema** — `resource.schema` / `defineListSchema` bilan URL param → filter; har sahifadagi qo'lda qurishni yo'q qiladi.
- **React hook va Vue composable** — `useListParams` (`react-router` / `vue-router` ichida), `useListParamsBase` (router-agnostik), `/react` va `/vue` da. `createListState` — shu mantiq, framework'siz.
- **SSR** — `resource.fromSearchParams(sp, {schema})` hook'siz, `URLSearchParams`'dan to'g'ridan-to'g'ri payload.
- **Query keys** — `resource.keys` TanStack/SWR uchun barqaror kalitlar.
- **Zero dependency** — axios/react-query/dayjs YO'Q. `react` (+ hook uchun `react-router`) va `vue` (+ `vue-router`) ixtiyoriy peer.

## O'rnatish

```bash
bun add @querykitjs/web
# React hook uchun: react (peer). `useListParams` uchun qo'shimcha: react-router (peer).
# Router-agnostik `useListParamsBase` react-router talab qilmaydi.
# Vue composable uchun: vue (peer). `useListParams` uchun qo'shimcha: vue-router (peer).
```

### Talablar

|                                                        | Versiya              | Tekshiriladi (`bun run test:matrix`) |
| ------------------------------------------------------ | -------------------- | ------------------------------------ |
| Node.js                                                | `>=22.12`            | 24                                   |
| `react` (ixtiyoriy peer)                               | `^18.3 \|\| ^19.2.7` | 18.3.1, 19.3.1                       |
| `react-router` (ixtiyoriy peer, faqat `useListParams`) | `^7.0 \|\| ^8.0`     | 7.18.5, 8.5.1                        |
| `vue` (ixtiyoriy peer)                                 | `^3.5`               | 3.5.0, 3.5.44                        |
| `vue-router` (ixtiyoriy peer, faqat `useListParams`)   | `^4.6 \|\| ^5`       | 4.6.4, 5.4.0                         |

Node 20 endi qo'llab-quvvatlanmaydi (`engines`: `>=22.12`). Peer diapazoni — oxirgi ikki major; ikkala cheti testda. Vue'ning bitta qo'llab-quvvatlanadigan major'i bor: diapazon 3.5 dan — vue-router 4.6 qabul qiladigan eng eski minor.

**`react-router-dom` → `react-router`.** `useListParams` endi `react-router`dan import qiladi (v7 va v8 ikkalasi ham `useSearchParams` eksport qiladi). `react-router-dom` o'rnatilgan loyiha `react-router` ni ham o'rnatadi — v7 da u allaqachon `react-router-dom`ning bog'liqligi: `npm i react-router`.

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
  adapter: "mongoose", // "mongoose" | "mongodb" | "drizzle-pg" | "drizzle-sqlite" | "prisma-pg"
  defaults: {
    perPage: 20, // list (offset) sahifa hajmi
    limit: 20, // infinite + cursor hajmi
    sort: ["-createdAt"], // list + infinite tartibi (boshidagi "-" = desc)
    cursor: { order: "asc" }, // faqat cursor: kalit bo'ylab yurish tartibi
  },
  timestamps: { createdAt: "created_at" }, // backend registry'dagi bilan bir xil; default sort shu maydon bo'yicha desc
  pruneEmpty: true, // bo'sh filterlarni tashlash (""/null/undefined/[]); 0/false qoladi
});
```

| Config                  | Vazifasi                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adapter`               | Backend turi — `with` tipini moslaydi (faqat intellisense).                                                                                               |
| `defaults.perPage`      | `list` uchun default `perPage`.                                                                                                                           |
| `defaults.limit`        | `infinite` va `cursor` uchun default `limit`.                                                                                                             |
| `defaults.sort`         | `list`/`infinite` default sort — `[{key,direction}]` yoki `["-field"]` shorthand.                                                                         |
| `defaults.cursor.order` | Default cursor tartibi (`"asc"`/`"desc"`).                                                                                                                |
| `timestamps.createdAt`  | Backend `timestamps.createdAt` bilan bir xil; `defaults.sort` yo'q bo'lsa default sort `[{ key: createdAt, direction: "desc" }]` (default `"createdAt"`). |
| `pruneEmpty`            | Form input'lardan qurilgan bo'sh filterlarni avtomatik tashlash (default `true`).                                                                         |

Har bir default har chaqiriqда override qilinadi.

## `qk.resource<TEntity>(name)` — entity qatlami

```ts
import type { IUser } from "@my/api-types";
export const users = qk.resource<IUser>("users"); // "users" = cache-key namespace (majburiy, unikal)
```

| A'zo                                                           | Nima                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `users.list(input)`                                            | offset (page) payload quradi                                                 |
| `users.infinite(input)`                                        | infinite (limit/offset) payload quradi                                       |
| `users.cursor(input)`                                          | cursor (keyset) payload quradi                                               |
| `users.params(input)`                                          | pagination'siz payload (filter/sort/columns/with)                            |
| `users.f`                                                      | `createFilters<IUser>()` — maydon-tipli builder                              |
| `users.search(term, fields, { operation? })`                   | ko'p maydon bo'ylab OR preset (`contains` default, `startsWith`, `endsWith`) |
| `users.schema(desc)`                                           | `defineListSchema` bog'langan (URL ↔ filter)                                 |
| `users.fromSearchParams(sp, {schema})`                         | `URLSearchParams`'dan to'g'ridan-to'g'ri list payload (SSR / hook'siz)       |
| `users.keys`                                                   | TanStack/SWR uchun barqaror query keys                                       |
| `users.parseList / parseInfinite / parseCursor`                | javob meta'sini snake→camel                                                  |
| `ListResult<T> / InfiniteResult<T> / CursorResult<T>` (tiplar) | `parse*` qaytaradigan tiplar                                                 |

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
users.search("ali", ["buyerName"], { operation: "startsWith" });
// → or(startsWith("buyerName","ali")) — indeks ishlatishi mumkin
```

- `contains` qimmat: `%ali%` B-tree indeksini ishlata olmaydi (Postgres'da to'liq skan, MongoDB'da regex). Katta jadvalda `startsWith` (`ali%`) yoki full-text qidiruvni tanlang.
- Har maydon serverda `filterable` bo'lishi kerak, o'sha operator bilan (`{ buyerName: ["%_%"] }` yoki `["%_"]`); aks holda server `forbidden-key` / `forbidden-operator` bilan 400 qaytaradi.

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

**`withTotal: false`** — umumiy son kerak bo'lmasa (infinite-ga o'xshash ro'yxat, "keyingi" tugmasi), server count so'rovini ishlatmaydi:

```ts
const body = users.list({ page, perPage: 20, withTotal: false }); // payload'da withTotal: false (berilmasa — kalit yo'q)
const { meta } = users.parseList(res.data); // meta.totalCount === null, meta.totalPages === null; hasNext ishlaydi
```

`Meta.totalCount` / `Meta.totalPages` tipi `number | null`: `null` — count ishlamagan; server umuman bermagan maydon avvalgidek `0`. zod (`makeOffsetParamsSchema`) va class-validator (`makeOffsetParamsDto`) `withTotal`ni qabul qiladi.

`parse*` ikki darajaда bor (bitta umumiy implementatsiya — meta entity-agnostik):
`qk.parseList/...` (registry, `data: unknown[]`) — `resource` bo'lmasa; `users.parseList/...` (entity'ga tipli).

## Adapter-aware, wire-safe `with`

Registry `with`ni adapter bo'yicha tiplaydi — **faqat serializable** opsiyalar:

| adapter                         | `with[rel]` intellisense                                           | Ko'rsatilmaydi                                      |
| ------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| `mongoose`                      | `boolean \| { select?, populate?, match?, options? }`              | —                                                   |
| `mongodb`                       | `with` yo'q — relation'larni ikkinchi so'rov bilan yuklang         | har qanday `with` (TS xato; server `forbidden-key`) |
| `drizzle-pg` / `drizzle-sqlite` | `boolean \| { columns?, with?, limit?, offset? }`                  | `where:(f,op)=>…`, `orderBy:(f,op)=>…`, raw `sql`   |
| `prisma-pg`                     | `boolean \| { select?, include?, where?, orderBy?, take?, skip? }` | funksiya formalar                                   |

```ts
// adapter: "mongoose"
users.list({ with: { author: { select: "name email" } } }); // ✓ `select`
// adapter: "drizzle-pg"
users.list({ with: { author: { columns: { name: true } } } }); // ✓ `columns`; `where`-fn yashirin
```

Runtime o'zgarmaydi (pass-through) — bu sof DX. Funksiya/SQL formalarini JSON'da yubora olmaganingiz uchun ular umuman taklif qilinmaydi.

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
import { useListParams } from "@querykitjs/web/react"; // react-router ichida ishlatiladi
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

Hook `clamped: boolean` ham qaytaradi — URL'dagi `page` yoki `sort` limitdan oshgani uchun kesilgan (pastda «Limits»). URL'ni tuzatish uchun: `if (clamped) setPage(params.page)`.

**Router-agnostik** (Next.js, TanStack Router) — base hook'ga `searchParams` bering (`react-router` talab qilmaydi):

```tsx
import { useListParamsBase } from "@querykitjs/web/react";
const { params, setPage } = useListParamsBase(users, { schema: usersSchema, searchParams, setSearchParams });
```

## Vue composable

```ts
import { useListParams } from "@querykitjs/web/vue"; // ichida vue-router
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";

const users = qk.resource<IUser>("users");
const usersSchema = users.schema({ name: { operation: "%_%", trim: true }, status: { operation: "=" } });

// <script setup> ichida
const { params, clamped, setParam, setPage, setSort, reset } = useListParams(users, { schema: usersSchema });

const q = useQuery({
  queryKey: computed(() => users.keys.list(params.value)),
  queryFn: async () => users.parseList((await axios.post("/users/list", params.value)).data),
});
// setParam("status", "active") → router.push({ query }) (tarixda yangi yozuv), page reset
```

React hook bilan bir xil o'qish, clamp va setterlar — `params`, `clamped` va `searchParams` computed ref.
Takroriy kalit (`?status=a&status=b`) saqlanadi; `?q` (`=` siz) bo'sh qiymat sifatida o'qiladi. SSR (Nuxt) da ishlaydi: `window` ga murojaat yo'q.

**Router-agnostik** — base composable'ga `searchParams` (ref, getter yoki qiymat) bering:

```ts
import { useListParamsBase } from "@querykitjs/web/vue";
const { params, setPage } = useListParamsBase(users, { schema: usersSchema, searchParams: () => currentSearchParams.value, setSearchParams });
```

## Istalgan framework — `createListState`

Ikkala hook ortidagi mantiq, framework'siz (Svelte, Solid, vanilla). Toza: search params'ni o'qiydi va keyingisini qaytaradi; navigatsiya sizda.

```ts
import { createListState } from "@querykitjs/web";

const list = createListState(users, { schema: usersSchema });
const { params, clamped } = list.read(new URLSearchParams(location.search));
const next = list.actions(new URLSearchParams(location.search)).setPage(2); // yangi URLSearchParams
history.pushState(null, "", `?${next}`);
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

> Tayyor options: [`@querykitjs/tanstack-query`](../tanstack-query/README.md) shu obyektlarni o'zi quradi — `listOptions`, `infiniteOptions`, `cursorOptions` (kalit, fetch, meta parse, sahifa parametrlari).

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

### Paginatsiya chegaralari

`perPage`/`limit` **clamp qilinadi** — default `@querykitjs/core`ning
`DEFAULT_MAX_PER_PAGE` / `DEFAULT_MAX_LIMIT` (200). Bu aynan zod factory'lari va
ikkala backend repository'si ishlatadigan konstanta, ya'ni front server rad
etadigan so'rovni umuman yubormaydi.

```ts
createQuery({ maxPerPage: 50, maxLimit: 25 });
createRegistry({ adapter: "drizzle-pg", defaults: { maxPerPage: 50, maxLimit: 25 } });

// cheklovni o'chirish (⚠️ cap'siz paginatsiya DoS yuzasi):
createQuery({ maxPerPage: Infinity });
```

## Limits

`perPage`/`limit` clamp qilinadi (yuqorida), lekin **sahifa chuqurligi** va **sort maydonlari soni** clamp qilinmaydi — builder `Error` tashlaydi, chunki jim kesish so'rov ma'nosini o'zgartirardi (boshqa sahifa yoki boshqa tartib). Qiymatlar `@querykitjs/core`dan — zod va class-validator bilan bir xil.

| Limit           | Default  | Nima sanaladi                                        | Oshsa                                                                 |
| --------------- | -------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| `maxOffset`     | `10 000` | `list`: `(page - 1) × perPage`; `infinite`: `offset` | `Error: querykit: page 502 × perPage 20 exceeds maxOffset (10000); …` |
| `maxSortFields` | `3`      | normalizatsiyadan keyingi `sort` maydonlari          | `Error: querykit: sort with 4 fields exceeds maxSortFields (3)`       |

```ts
buildListParams({ page: 501, perPage: 20 }); // ✅ offset 10 000
buildListParams({ page: 502, perPage: 20 }); // ❌ Error — chuqurroq sahifalar uchun buildCursorParams

createQuery({ maxOffset: 50_000, maxSortFields: 4 });
createRegistry({ adapter: "drizzle-pg", defaults: { maxOffset: 50_000 } });
```

- Filtr limitlari (chuqurlik, shartlar, `in` elementlari, satr uzunligi) web'da **tekshirilmaydi** — ularni server (zod / class-validator) rad etadi va 400 qaytaradi.
- **URL o'quvchilar clamp qiladi.** URL foydalanuvchi qo'lida, shuning uchun `readListParams`, `searchParamsToPayload`, `resource.fromSearchParams` va hook'lar (`useListParams`, `useListParamsBase`) xato tashlamaydi: `page` ruxsat etilgan oxirgi sahifaga (`floor(maxOffset / perPage) + 1`), `sort` birinchi `maxSortFields` maydoniga kesiladi va natijada `clamped: true` bo'ladi. `?page=9999&size=20` → `page: 501`, `clamped: true`; `?sortType=a,b,c,d` → 3 maydon, `clamped: true`. Registry orqali — registry `defaults` limitlari bilan.

```ts
const read = readListParams(schema, new URLSearchParams("page=9999&size=20")); // { page: 501, perPage: 20, clamped: true, … }
const body = users.fromSearchParams(sp, { schema }); // body.clamped === true
JSON.stringify(body); // clamped yo'q — u payload'da non-enumerable, server'ga bormaydi
const { params, clamped } = useListParams(users, { schema }); // render paytida xato yo'q
```

Dasturchi to'g'ridan-to'g'ri chaqirgan builder'lar (`buildListParams`, `resource.list`, …) avvalgidek `Error` tashlaydi.

## Migrating (limitlar)

- `buildListParams` / `buildInfiniteParams` / `createQuery` / registry `list`/`infinite` endi offset 10 000 dan chuqur yoki 3 tadan ko'p sort maydonli so'rovda `Error` tashlaydi (ilgari payload yasalardi va server uni qabul qilardi). Chuqur sahifalar — cursor; zarur bo'lsa `maxOffset` / `maxSortFields` bilan oshiring (serverda ham xuddi shu limitni oshiring).

- `Meta.totalCount` / `Meta.totalPages` endi `number | null` (`withTotal: false` javobida `null`). `meta.totalCount + 1` kabi kod TS'da `null` tekshiruvini talab qiladi; `withTotal` yubormaydigan ilovada qiymat avvalgidek raqam.
- URL'dan o'qilgan chuqur `page` endi xato emas, clamp (`clamped: true`) — error boundary yoki qo'lda tekshiruv kerak emas.

## Xatolar — `isQueryKitError`

Server so'rovni rad etsa (`forbidden-key`, `forbidden-operator`, `limit-exceeded`, `empty-filter`, …), backend `QueryKitError.info`ni 400 javobida qaytarishi mumkin. Javob konverti loyihaniki; web faqat `info` shaklini tiplaydi:

```ts
import { isQueryKitError, type QueryKitErrorBody } from "@querykitjs/web";

// backend: catch (e) { if (e instanceof QueryKitError) return res.status(400).json({ error: e.info }); }
const body = error.response?.data?.error;
if (isQueryKitError(body)) {
  // body: { reason, site, key, source?, operation? }
  if (body.reason === "forbidden-key" && body.site === "filter") showFieldError(body.key);
}
```

`isQueryKitError` `reason` va `site` ni core ro'yxatidan tekshiradi, `key` — satr; boshqa har obyekt (masalan `{ statusCode: 400, message }`) → `false`.

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
| `resource.search(term, fields, { operation? })`                                   | OR preset (`contains` / `startsWith` / `endsWith`)     |
| `resource.schema(desc)` / `defineListSchema(desc)`                                | URL param → filter tavsifi                             |
| `resource.fromSearchParams(sp, {schema})`                                         | searchParams → list payload (SSR)                      |
| `resource.keys`                                                                   | TanStack/SWR query keys                                |
| `resource.parseList/parseInfinite/parseCursor`                                    | javob meta'sini camelCase                              |
| `qk.parseList/parseInfinite/parseCursor`                                          | registry-level parse (entity-agnostik)                 |
| `buildParams / buildListParams / buildInfiniteParams / buildCursorParams`         | standalone builder'lar                                 |
| `createQuery(config)`                                                             | registry'siz builder (default'lar/pruneEmpty)          |
| `schemaToFilter(schema, sp)`                                                      | searchParams → `FieldCondition[]`                      |
| `searchParamsToPayload(schema, sp)`                                               | searchParams → to'liq payload (clamp, `clamped`)       |
| `readListParams(schema, sp, url?, limits?)`                                       | searchParams → `ListParams` + `clamped`                |
| `isQueryKitError(body)` / `QueryKitErrorBody`                                     | 400 javobidagi querykit xatosini tanish                |
| `setParam/setPage/setSize/setSort/resetParams`                                    | URL yozish (immutable, page-reset)                     |
| `encodeSort/decodeSort`                                                           | `[{key,direction}]` ↔ `"-createdAt,id"` (multi-field)  |
| `useListParams(resource, {schema})` (`/react`)                                    | URL-sync hook (react-router)                           |
| `useListParamsBase(resource, {schema, searchParams, setSearchParams})` (`/react`) | router-agnostik hook                                   |
| `useListParams` / `useListParamsBase` (`/vue`)                                    | Vue composable sifatida xuddi shu (computed ref)       |
| `createListState(resource, {schema, url?, with?})`                                | framework'siz `read(sp)` / `actions(sp)`               |

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
