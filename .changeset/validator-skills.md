---
"@querykitjs/zod": patch
"@querykitjs/class-validator": patch
---

Both validators now ship an agent skill in the npm tarball: `skills/querykit-<pkg>/SKILL.md`. It holds the safety rules (factories, server-owned `columns` / `with` / `withDeleted`, limits, `allowedKeys` / `maxDepth`), setup, typechecked examples and the shared request contract.
