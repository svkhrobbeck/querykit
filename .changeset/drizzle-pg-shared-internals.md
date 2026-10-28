---
"@querykitjs/drizzle-pg": patch
---

Use the shared `@querykitjs/core/internal` helpers (cursor tokens, skip diagnostics, transaction context, sort normalization, pagination metas) and split the repository into modules. The public API, the cursor token format and every result are unchanged.

One fix for malformed input: a `sort` item without a `key` (`null`, `{}`) is now dropped, as `@querykitjs/prisma-pg` and `@querykitjs/mongoose` already do — before, it threw a `TypeError` (a 500). It is not reported through `onSkippedCondition` and does not throw under `strict`.
