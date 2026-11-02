---
"@querykitjs/drizzle-pg": patch
"@querykitjs/prisma-pg": patch
"@querykitjs/mongoose": patch
---

Each adapter now ships its agent skill in the npm tarball: `skills/querykit-<pkg>/SKILL.md`. It holds the safety rules (`filterable`, `sortable`, `raw()`, `relations`, limits, `strict`, `{ all: true }`, `cursorSecret`), setup, typechecked examples for the common tasks and the shared request contract.
