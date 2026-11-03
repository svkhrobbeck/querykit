---
"@querykitjs/web": minor
---

New `@querykitjs/web/angular` entry: `injectListParams` (Angular Router) and `injectListParamsBase` — the same list URL state as the React and Vue versions, with `params`, `clamped` and `searchParams` as signals. A setter navigates with `router.navigate`; call it in an injection context. A plain ESM entry, no Angular package format. Optional peers: `@angular/core` and `@angular/router` ^21 || ^22, `rxjs` ^7.8.
