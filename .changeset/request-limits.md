---
"@querykitjs/zod": major
"@querykitjs/core": minor
"@querykitjs/class-validator": minor
"@querykitjs/web": minor
---

Request limits: every filter and pagination request is bounded in size at parse time.

- **core**: `DEFAULT_MAX_FILTER_DEPTH` (5), `DEFAULT_MAX_CONDITIONS` (30), `DEFAULT_MAX_IN_ITEMS` (200), `DEFAULT_MAX_STRING_LENGTH` (256), `DEFAULT_MAX_OFFSET` (10 000), `DEFAULT_MAX_SORT_FIELDS` (3), the `QueryLimits` type, `DEFAULT_QUERY_LIMITS` and `resolveLimits(partial)`. `@querykitjs/core/internal` gets the iterative `findFilterLimitViolation` walk the validators share.
- **zod** (breaking): the factories take `limits` and the constant schemas apply the core defaults. A payload past a limit is rejected (`filter exceeds maxInItems (200)`); a 10 000-level `not` chain is rejected before the recursive schema runs, without a stack overflow. `offsetParamsSchema` and `makeOffsetParamsSchema()` carry an object-level check, so zod 4 refuses `.pick()` / `.omit()` on them.
- **class-validator**: `validateFilter`, `validateSort`, the DTOs and the DTO factories (`limits`) apply the same limits; new `IsWithinMaxOffset` decorator; new message key `querykit.limit.exceeded` in en/uz/ru; `querykit.filter.max_depth` now names `maxDepth (5)`.
- **web**: the list and infinite builders throw an `Error` for an offset past `maxOffset` or more than `maxSortFields` sort fields instead of building the payload (`QueryConfig` / registry `defaults`: `maxOffset`, `maxSortFields`). Filter limits stay with the server.
