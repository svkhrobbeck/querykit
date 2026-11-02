---
"@querykitjs/mongodb": major
---

New package `@querykitjs/mongodb` (1.0.0): querykit repositories over the official MongoDB driver (task 017).

- `createRegistry(client, options)` / `registry.repository(collection, { schema, objectId, ... })` — the same options, errors and meta as `@querykitjs/mongoose`; field types, casting and the default `filterable` come from a zod object schema.
- Safe by default: `filterable` / `sortable` / `limits` (core policy), branded `raw()` only, object values refused (`invalid-value`), `maxTimeMS` 2000 on every read, cursor v2 with `_id` tie-break and optional signing, atomic `updateWhere` / `deleteWhere` with `empty-filter`, `withTotal`, scope `{ in }`, timestamps, soft delete, transactions (`client.withSession`).
- `with` is refused in this version (no `$lookup`).
- `explainFind` in `@querykitjs/mongodb/testing`; the package ships its `querykit-mongodb` agent skill.
