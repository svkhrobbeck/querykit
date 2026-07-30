# @querykitjs/class-validator

## 1.0.0

### Major Changes

- Initial release — the class-validator counterpart to `@querykitjs/zod`. Same
  request contract, same operator source (`FILTER_OPERATORS` from
  `@querykitjs/core`), expressed as decorators and DTOs for NestJS apps instead
  of zod schemas.

  - `@IsQueryFilter()` / `@IsQuerySort()` validate the whole filter tree — flat
    arrays, nested `and`/`or`/`not`, every core operator — from a single
    decorator. The recursion lives in a framework-agnostic `validateFilter` /
    `validateSort` core that also runs under Express or Hono.
  - Param DTOs for all three paginations (`OffsetParamsDto`,
    `InfiniteParamsDto`, `CursorParamsDto`) plus `makeOffsetParamsDto` /
    `makeInfiniteParamsDto` / `makeCursorParamsDto` factories. Safe by default:
    `perPage` / `limit` carry the core caps, and `columns` / `with` /
    `withDeleted` are opened only via `allow`.
  - Two guards `@querykitjs/zod` does not have: an `allowedKeys` field allowlist
    that rejects a filter on an unknown field instead of dropping it silently,
    and a `maxDepth` cap on filter recursion. `allowedKeys: []` denies every key,
    which is deliberately different from omitting it (allow-all).
  - Messages are i18n-shaped (`querykit.filter.*` keys plus interpolation args)
    with en/uz/ru catalogs included, so `I18nValidationPipe` can translate them
    and a custom catalog is type-checked against the full key set.

  Requires `ValidationPipe({ transform: true, whitelist: true })`: unlike zod,
  class-validator does not strip undeclared properties on its own.
