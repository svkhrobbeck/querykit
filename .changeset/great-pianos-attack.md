---
"@querykitjs/class-validator": minor
---

Add `@querykitjs/class-validator` — the class-validator counterpart to
`@querykitjs/zod`. Same request contract, same operator source
(`FILTER_OPERATORS` from core), expressed as decorators and DTOs for NestJS
apps instead of zod schemas.

- `@IsQueryFilter()` / `@IsQuerySort()` validate the whole filter tree —
  flat arrays, nested `and`/`or`/`not`, every core operator — from a single
  decorator; the recursion lives in a framework-agnostic `validateFilter` /
  `validateSort` core that also runs under Express or Hono.
- Param DTOs for all three paginations (`OffsetParamsDto`, `InfiniteParamsDto`,
  `CursorParamsDto`) plus `makeOffsetParamsDto` / `makeInfiniteParamsDto` /
  `makeCursorParamsDto` factories. Safe by default: `perPage`/`limit` carry the
  core caps and `columns`/`with`/`withDeleted` are opened only via `allow`.
- Two guards `@querykitjs/zod` does not have: an `allowedKeys` field allowlist
  that rejects a filter on an unknown field instead of dropping it silently,
  and a `maxDepth` cap on filter recursion.
- Messages are i18n-shaped (`querykit.filter.*` keys plus interpolation args)
  with en/uz/ru catalogs included, so `I18nValidationPipe` can translate them
  and a custom catalog is type-checked against the full key set.
