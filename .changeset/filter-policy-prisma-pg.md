---
"@querykitjs/prisma-pg": major
"@querykitjs/core": minor
"@querykitjs/drizzle-pg": major
---

Request policy in prisma-pg, and branded raw filters (R19).

- **prisma-pg** (breaking): repository options `filterable` (field → operators or `"*"`; relation fields as `"relation.field"`), `sortable` and `limits` (also on the registry) — the same names, defaults, reasons and sites as drizzle-pg. Without `filterable` a client may filter only by `allowedColumns` (else the `forcedColumns` keys, else the `@id` field) with `=` and `in`, and sort only by `@id` and `createdAt`. A refused filter, sort, `cursorKey`, offset or aggregate field throws `QueryKitError` before Prisma is called. A raw Prisma `where` must now be branded with `raw()`; an unbranded one throws `forbidden-key` (README "Migrating to 2.0").
- **core**: `raw(value)` brands a driver-native filter object with a `Symbol` (a JSON body cannot carry one); `@querykitjs/core/internal` gets `isRaw`, and the policy refuses an unbranded driver object as `forbidden-key`.
- **drizzle-pg**: a JSON-shaped object that is not a condition or a group is now refused as `forbidden-key` instead of being skipped; drizzle `SQL` fragments are accepted as before.
