---
"@querykitjs/drizzle-pg": patch
"@querykitjs/prisma-pg": patch
"@querykitjs/mongoose": patch
"@querykitjs/core": minor
---

Cursor pagination with a non-unique `cursorKey` (task 012): `findCursor` seeks on `(cursorKey, primary key)` — `(k > v) OR (k = v AND id > i)`, ordered by both — so rows that share a value (for example one `createdAt`) are never skipped or repeated; a primary-key cursor keeps the one-field seek.

- Cursor tokens are v2 (`{ v: 2, k, id }`): only scalar values, cast to the field type; an object, an array, a value that does not fit or an old v1 token is refused with `QueryKitError` `reason: "invalid-value"`, `site: "cursorKey"` before the driver runs. Start paging from the first page after the upgrade (README "Migrating").
- New registry option `cursorSecret`: tokens are signed with HMAC-SHA256 (Web Crypto) and an unsigned or altered token is `invalid-value`.
- **core** (`@querykitjs/core/internal`): `encodeCursorToken` / `decodeCursorToken` and type `CursorToken`; `cursorPage` is async and takes `idField` and `secret`.
