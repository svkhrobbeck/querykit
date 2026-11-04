---
"@querykitjs/drizzle-pg": patch
"@querykitjs/prisma-pg": patch
"@querykitjs/mongoose": patch
"@querykitjs/mongodb": patch
---

Fixed rows repeating or going missing between `findList` and `findInfinite` pages when the sort column holds equal values. Both methods now end the order on the primary key, in the first key's direction, unless the sort already holds it. The key does not count against `maxSortFields` and need not be in `sortable`. A table with no primary key keeps its order. `findAll`, `findOne` and `findCursor` do not change.

⚠️ An index on `(col)` alone no longer serves this order directly. PostgreSQL may use an incremental sort, and MongoDB sorts in memory without a compound `(col, _id)` index. On a large table add a compound index on `(col, primary key)`, the one `findCursor` already needs.
