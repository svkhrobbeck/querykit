---
"@querykitjs/web": major
---

`useListParams` imports `useSearchParams` from `react-router` (v7 or v8) instead of `react-router-dom`; the peer is now `react-router ^7.0 || ^8.0` (optional). A project on `react-router-dom` v7 installs `react-router` as well: `npm i react-router`. The hook's signature is unchanged.
