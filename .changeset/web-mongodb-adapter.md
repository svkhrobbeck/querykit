---
"@querykitjs/web": minor
---

`createRegistry({ adapter: "mongodb" })` is typed for `@querykitjs/mongodb`. That backend loads no relations, so `with` is a compile-time error for this adapter (the server would answer `forbidden-key`); load relations with a second request. Runtime payloads are unchanged.
