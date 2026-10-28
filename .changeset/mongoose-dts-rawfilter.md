---
"@querykitjs/mongoose": patch
---

Fix the published types of `createFilters`: `dist/index.d.ts` referred to `RawFilter<_TDoc>`, a name not in scope, so a consumer compiling with `skipLibCheck: false` got `TS2552 Cannot find name '_TDoc'`. The public type is unchanged.
