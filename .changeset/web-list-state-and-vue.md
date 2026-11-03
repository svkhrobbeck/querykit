---
"@querykitjs/web": minor
---

New `@querykitjs/web/vue` entry: `useListParams` (vue-router 4 / 5) and `useListParamsBase` — the same reads, clamping and setters as the React hooks, with `params`, `clamped` and `searchParams` as computed refs. A setter navigates with `router.push({ query })`; a repeated query key is kept. Optional peers: `vue` ^3.5, `vue-router` ^4.6 || ^5.

New `createListState(resource, { schema, url?, with? })` in `@querykitjs/web`: the framework-free list URL state (`read(searchParams)`, `actions(searchParams)` returning the next params) for Svelte, Solid or vanilla code. The React hooks now use it; their signatures and behaviour are unchanged.
