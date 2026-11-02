---
"@querykitjs/core": patch
"@querykitjs/zod": patch
"@querykitjs/class-validator": patch
---

Smaller bundles: every export tree-shakes on its own (task 016).

- **core**: `@querykitjs/core/internal` no longer imports `node:async_hooks` statically (it is loaded when an adapter creates its context store), so `@querykitjs/zod` and `@querykitjs/class-validator` bundle for the browser; the build no longer uses `keepNames`, and `f` is marked pure — importing one constant now costs ~180 B instead of ~850 B.
- **zod**: importing one schema no longer keeps every schema (`sortSchema` alone: ~9 % of the entry instead of 76 %).
- **class-validator**: the deprecated static DTOs and the load-time decorators are split into their own chunks, so importing a constant or a message catalog no longer carries every decorator (one constant: ~9 KB → ~0.5 KB minified).
- All packages: minified builds (class names kept where they are public), `exports` with separate `import` / `require` types (`.d.ts` / `.d.cts`) and node10 `typesVersions` for subpaths — `publint` and `attw` report no problems. Public API and types are unchanged.
