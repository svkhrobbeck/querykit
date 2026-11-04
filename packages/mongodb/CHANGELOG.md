# @querykitjs/mongodb

## 1.0.2

### Patch Changes

- 14ca0d6: Fixed rows repeating or going missing between `findList` and `findInfinite` pages when the sort column holds equal values. Both methods now end the order on the primary key, in the first key's direction, unless the sort already holds it. The key does not count against `maxSortFields` and need not be in `sortable`. A table with no primary key keeps its order. `findAll`, `findOne` and `findCursor` do not change.
  
  ⚠️ An index on `(col)` alone no longer serves this order directly. PostgreSQL may use an incremental sort, and MongoDB sorts in memory without a compound `(col, _id)` index. On a large table add a compound index on `(col, primary key)`, the one `findCursor` already needs.
- Updated dependencies [7a9c0f8]
- Updated dependencies [0f5bd25]
  - @querykitjs/core@2.1.0

## 1.0.1

### Patch Changes

- 7633daa: Republish with a resolved `@querykitjs/core` dependency. 1.0.0 was published by hand with `workspace:*`, so it cannot be installed.

## 1.0.0

### Major Changes

- 2f8b53e: New package `@querykitjs/mongodb` (1.0.0): querykit repositories over the official MongoDB driver (task 017).
  
  - `createRegistry(client, options)` / `registry.repository(collection, { schema, objectId, ... })` — the same options, errors and meta as `@querykitjs/mongoose`; field types, casting and the default `filterable` come from a zod object schema.
  - Safe by default: `filterable` / `sortable` / `limits` (core policy), branded `raw()` only, object values refused (`invalid-value`), `maxTimeMS` 2000 on every read, cursor v2 with `_id` tie-break and optional signing, atomic `updateWhere` / `deleteWhere` with `empty-filter`, `withTotal`, scope `{ in }`, timestamps, soft delete, transactions (`client.withSession`).
  - `with` is refused in this version (no `$lookup`).
  - `explainFind` in `@querykitjs/mongodb/testing`; the package ships its `querykit-mongodb` agent skill.

### Patch Changes

- Updated dependencies [3d784f3]
- Updated dependencies [f5639d8]
- Updated dependencies [4d440e3]
- Updated dependencies [e88d791]
- Updated dependencies [a60c564]
- Updated dependencies [cf30c25]
- Updated dependencies [5e0551f]
- Updated dependencies [307c14c]
- Updated dependencies [735749f]
- Updated dependencies [7b341d3]
- Updated dependencies [0eedc06]
- Updated dependencies [02210b4]
  - @querykitjs/core@2.0.0
