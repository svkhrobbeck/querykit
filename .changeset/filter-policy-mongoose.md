---
"@querykitjs/mongoose": major
"@querykitjs/core": minor
"@querykitjs/drizzle-pg": patch
"@querykitjs/prisma-pg": patch
---

Request policy in mongoose, LIKE wildcard limit, read time limit.

- **mongoose** (breaking): repository `filterable` / `sortable` / `limits` (also on the registry) — the same names, defaults, reasons and sites as drizzle-pg and prisma-pg (`id` ≡ `_id`). An unbranded raw Mongo filter (`{ $where }`, `{ $expr }`, `{ path: { $regex } }`) is refused as `forbidden-key`; wrap server-side filters in `raw()`. Every read (`find`, `findOne`, `countDocuments`, `aggregate`) runs with `maxTimeMS` (registry / repository option, default 2000); a timeout throws `QueryKitTimeoutError`. A run of `%%` in a LIKE pattern compiles to one `.*`. README "Migrating to 3.0".
- **core**: `QueryLimits.maxLikeWildcards` (`DEFAULT_MAX_LIKE_WILDCARDS` = 2) checked by the adapter policy for `like` / `ilike` / `notLike`; `QueryKitTimeoutError` (`code: "QUERYKIT_TIMEOUT"`).
- **drizzle-pg**, **prisma-pg**: a LIKE pattern with more than `maxLikeWildcards` wildcards is refused as `limit-exceeded` (inside their pending majors).
