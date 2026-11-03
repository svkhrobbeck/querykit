# @querykitjs/tanstack-query

> querykit resource'dan tayyor [TanStack Query](https://tanstack.com/query) options — list, infinite va cursor so'rovlari: kalit, fetch, meta parse va sahifa parametrlari.

[English](./README.en.md)

Har so'rov uchun bitta chaqiruv. React, Vue, Solid va Svelte Query uchun kod bir xil:

```ts
const { data } = useQuery(listOptions(users, { page: 2 }, fetcher));
const feed = useInfiniteQuery(cursorOptions(posts, { limit: 20 }, fetcher));
```

Kalitlar — [`resource.keys`](../web/README.md#query-keys--userskeys), shuning uchun mavjud invalidatsiya kodi ishlashda davom etadi.

## O'rnatish

```bash
npm i @querykitjs/tanstack-query @querykitjs/web @tanstack/react-query   # yoki vue-query, solid-query, svelte-query
```

### Talablar

|                        | Versiya   | Tekshiriladi (`bun run test:matrix`) |
| ---------------------- | --------- | ------------------------------------ |
| Node.js                | `>=22.12` | 24                                   |
| `@tanstack/query-core` | `^5.0.0`  | 5.0.0, 5.104.5                       |
| `@querykitjs/web`      | `^4.0.0`  | workspace                            |

TanStack Query bitta major'da yashaydi (v4 API'si boshqa), shuning uchun diapazon birinchi v5 relizidan boshlanadi. Runtime bog'liqlik yo'q.

## Fetcher

So'rovni o'zingiz yuborasiz — HTTP klient, base URL va auth sizniki:

```ts
import type { Fetcher } from "@querykitjs/tanstack-query";

const fetcher = <R>(path: string) => ((body, { signal }) => api.post<R>(path, body, { signal })) satisfies Fetcher<unknown, R>;
```

`(payload, { signal }) => Promise<server javobi>` — `signal` ni uzating, TanStack eskirgan so'rovni bekor qila olsin. Options javobni `resource.parseList` / `parseInfinite` / `parseCursor` bilan parse qiladi.

## Options

| Eksport                                     | Qayerda            | Kalit                               | Sahifa parametrlari                                                                                                  |
| ------------------------------------------- | ------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `listOptions(resource, input, fetcher)`     | `useQuery`         | `keys.list(payload)`                | —                                                                                                                    |
| `infiniteOptions(resource, input, fetcher)` | `useInfiniteQuery` | `keys.infinite(offset'siz payload)` | `initialPageParam: offset`, keyingi = `meta.nextOffset`                                                              |
| `cursorOptions(resource, input, fetcher)`   | `useInfiniteQuery` | `keys.cursor(cursor'siz payload)`   | `initialPageParam: cursor`, keyingi = `meta.nextCursor`, oldingi = `meta.prevCursor` (`direction: "backward"` bilan) |
| `detailOptions(resource, id, fetcher)`      | `useQuery`         | `keys.detail(id)`                   | —                                                                                                                    |

`input` — `resource.list()` / `infinite()` / `cursor()` qabul qiladigan narsa yoki `useListParams` qurgan tayyor payload. Infinite va cursor kalitida sahifa parametri yo'q, shuning uchun hamma sahifalar bitta kesh yozuvida.

```ts
// serverda oldindan yuklash
await queryClient.prefetchQuery(listOptions(users, { page: 1 }, fetcher("/users/list")));
// yozuvdan keyin invalidatsiya
await queryClient.invalidateQueries({ queryKey: users.keys.all });
```

Hook'lar va mutation options yo'q: paket faqat options obyektlarini quradi.

## Agent skill

Paket AI yordamchilar uchun `skills/querykit-tanstack-query/SKILL.md` bilan chiqadi.

## Litsenziya

MIT
