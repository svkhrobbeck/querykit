---
"@querykitjs/drizzle-pg": major
"@querykitjs/core": minor
---

Request policy — safe by default.

- **drizzle-pg** (breaking): repository options `filterable` (field → operators or `"*"`), `sortable` and `limits` (also on the registry). Without `filterable` a client may filter only by `allowedColumns` (else the `forcedColumns` keys, else the primary key) with `=` and `in`, and sort only by the primary key and `createdAt`. A refused filter, sort, `cursorKey`, offset or aggregate key throws `QueryKitError` (`forbidden-key`, `forbidden-operator`, `limit-exceeded`) before any SQL runs, whatever `strict` says. A key the table does not have keeps the `unknown-key` behaviour. Restore 3.x per repository with `filterable: { column: "*" }` and a full `sortable` (README "Migrating to 4.0").
- **core**: `SkipReason` adds `forbidden-key`, `forbidden-operator`, `limit-exceeded`; `SkipSite` adds `page`; new `Filterable` type. `@querykitjs/core/internal` gets `resolvePolicy`, shared by every adapter.
