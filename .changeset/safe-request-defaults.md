---
"@querykitjs/core": minor
"@querykitjs/zod": minor
"@querykitjs/web": minor
---

Safe-by-default request validation, with the pagination cap shared across packages.

`@querykitjs/zod` only exported constant schemas, so every app patched the same
two holes by hand: `perPage` had no upper bound, and `columns` / `with` /
`withDeleted` were accepted from the client — meaning a request could ask for
`{ password: true }`, pull arbitrary relations, or switch off the soft-delete
guard.

- `makeOffsetParamsSchema` / `makeInfiniteParamsSchema` / `makeCursorParamsSchema`,
  each taking `ParamsSchemaOptions`.
- Capped at core's `DEFAULT_MAX_PER_PAGE` / `DEFAULT_MAX_LIMIT` (200) by default,
  and the three server-owned fields are absent from the schema, so a client that
  sends them has them stripped.
- `allow: ["withDeleted"]` opts a field back in, in the type as well as at
  runtime — an untyped `allow` would leave callers believing `columns` arrives
  when it does not, which is the same footgun.
- Named schema/param types are exported (`OffsetParamsSchema<TAllow>`,
  `MadeOffsetParams<TAllow>`, …), because `ReturnType<typeof
makeOffsetParamsSchema>` silently resolves to `any` for a function with a
  `const` type parameter.

The existing constants are untouched, so this is additive; smoke cases now pin
that they still have no cap and still accept all three fields.

`core` gains `DEFAULT_MAX_PER_PAGE` / `DEFAULT_MAX_LIMIT` as the single source for
the cap, and `@querykitjs/web` clamps from the same constant — so the frontend
never sends a request the server will reject.
