---
"@querykitjs/drizzle-pg": patch
"@querykitjs/prisma-pg": patch
"@querykitjs/mongoose": patch
"@querykitjs/core": minor
---

Bulk mutations and counts (task 013).

- `updateWhere(filter, patch, options?)` / `deleteWhere(filter, options?)` are one write on every adapter (prisma-pg and mongoose no longer read before the write) and return `{ count }`; with `{ returning: { limit } }` they return `{ count, rows }` (README "Bulk update and delete" says which rows are atomic per adapter). Before: `Row[]`.
- An empty filter (`undefined`, `{}`, `[]`, or every condition skipped) is refused with `QueryKitError` `reason: "empty-filter"`, `site: "mutation"` before the driver runs; `{ all: true }` asks for every row (the scope still applies). A mutation filter passes `filterable` and `limits` like a read's.
- `findList({ withTotal: false })` runs no count: `perPage + 1` rows, `has_next` from the extra row, `total_items` / `total_pages` `null`.
- README "Transactions": only database work inside the callback — external effects through an outbox, the driver may retry.
- **core**: `SkipReason` `empty-filter`, `SkipSite` `mutation`, `OffsetMeta` totals `number | null`, `WireOffsetParams.withTotal`, types `AllRows`, `MutationOptions`, `MutationCount`, `MutationRows`; `@querykitjs/core/internal` gets `isAllRows`, `isEmptyFilter`, `refuseEmptyFilter`, `offsetPageWithoutTotal`.
