---
"@querykitjs/drizzle-pg": patch
---

Fixed `upsert` and `upsertMany` under drizzle's `casing` option: the default `ON CONFLICT` set wrote `excluded."addressText"` for a column with no explicit name, and PostgreSQL rejected the statement under `casing: "snake_case"`. It now uses the name `casing` gives the column. Columns with an explicit name and connections without `casing` keep their meaning.
