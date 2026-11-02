---
"@querykitjs/drizzle-pg": patch
"@querykitjs/prisma-pg": patch
"@querykitjs/mongoose": patch
"@querykitjs/core": patch
---

Adapter parity (task 021): `contains` / `startsWith` / `endsWith` match their value literally (drizzle-pg escapes `%`, `_`, `\`); every filter value is cast to its field type and a mismatch is `invalid-value` instead of a driver error (all three); prisma-pg refuses an unescaped `_` in `like` / `ilike` as `invalid-value`; mongoose `not` follows SQL three-valued logic; NULL sorts first on `asc` and last on `desc` on every adapter (drizzle-pg `NULLS FIRST` / `NULLS LAST`, prisma-pg `{ sort, nulls }` where the field is known optional — runtime model or the `fields` override, which now patches fields by name); a malformed sort item is reported as `invalid-value` (`site: "sort"`).
