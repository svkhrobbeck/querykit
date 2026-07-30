---
"@querykitjs/drizzle-pg": major
"@querykitjs/mongoose": major
"@querykitjs/core": minor
---

Repository-level projection guards, pagination clamps, and visible (optionally
fatal) dropped conditions.

**BREAKING:** `RepoConfig` is gone from both adapters — the type is now
`RepositoryOptions`, one name across adapters. There is no deprecated alias; pin
the previous major if you need the old name.

Protecting a response used to be the route's job: every list endpoint repeated
`{ ...params, columns: SAFE_COLUMNS }`, where writing the spread the other way
round leaks the password column. The guard now lives with `scope`, in the
repository, where it cannot be written wrong.

- `RepositoryOptions` gains `forcedColumns` (the client's `columns` is ignored)
  and `allowedColumns` (it is intersected). An empty intersection yields the
  allowlist, never the full row — a request for a forbidden column is then merely
  useless instead of catastrophic. An empty guard is refused when the repository
  is built, since "select nothing" means "select everything" downstream.
- `registry.repository(table, options?, extend?)` — all four arities, the same in
  both adapters. mongoose was dropping its options object on the floor, so
  `scope` only ever worked through `scoped()`; it now reaches `buildRepository`.
- `findCursor` force-includes the cursor column so tokens work, and `cursorKey`
  comes from the client — under a guard that was a way to read a forbidden
  column. The column stays in the query and is stripped from the returned rows.
- `aggregate` honours the guard too: `min(password)` or a `groupBy` on a hidden
  column leaks as much as a projection does.
- `maxPerPage` / `maxLimit` on `createRegistry` (core defaults, 200), clamped in
  `findList`/`findInfinite`/`findCursor` — validation can be bypassed, this cannot.
- Filter/sort/`cursorKey`/`idKey` keys accept any string (`LooseColumnKey` /
  `LooseFieldKey`), so a validated payload needs no `as` cast; autocomplete is
  preserved. Compile-time asserts pin that core's wire shapes are assignable to
  the repository params.
- `strict` and `onSkippedCondition` on `createRegistry`. `strict` is `false` by
  default, so existing endpoints behave exactly as before and only the hook fires;
  a filter exists to _narrow_ a result set, so a mistyped key that vanishes
  silently makes an endpoint return more rows than intended. `scope` and
  `cursorKey` keys are always fatal, regardless of `strict`.
- `buildRepository` looked the table up by object identity and, on failure, said
  only "table was not found in the provided schema". It now distinguishes a
  duplicate schema import (a same-named table under a different instance — by far
  the common cause) from a genuinely absent table, and lists the available ones.

`core` gains `SkippedCondition` / `SkipReason` / `SkipSite` and the `QueryKitError`
class both adapters throw, so a backend handles either identically.
