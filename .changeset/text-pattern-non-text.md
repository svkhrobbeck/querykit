---
"@querykitjs/drizzle-pg": patch
---

A text-pattern operator (`contains` / `startsWith` / `endsWith` / `like` / `ilike` / `notLike` and the `%_%` tokens) on a non-text column (timestamp, number, boolean, uuid, enum …) is now `invalid-value`: the condition is skipped and reported through `onSkippedCondition`, a `QueryKitError` under `strict`, and the driver is not called. Before, Postgres rejected `timestamptz ~~* text` and the request failed with a 500. prisma-pg already skips it on a non-String field, mongoose and mongodb on a Date path.
