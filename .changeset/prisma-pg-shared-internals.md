---
"@querykitjs/prisma-pg": patch
---

Use the shared `@querykitjs/core/internal` helpers (cursor tokens, skip diagnostics, transaction context, sort normalization, pagination metas) and split the repository into modules. The public API, the cursor token format and every result are unchanged.
