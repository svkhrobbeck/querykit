---
"@querykitjs/core": minor
"@querykitjs/drizzle-pg": minor
"@querykitjs/mongoose": minor
---

Cast wire date values before they reach the driver.

A JSON body can only carry a date as a string, and a `timestamp`/`date` column in
drizzle's default `mode: "date"` is mapped through JS — so drizzle called
`value.toISOString()` on the string and every such filter returned a 500. This
affected every drizzle-pg user with a timestamp column, which is most of them.

Coercion now sits in one place, before the operator builder, so scalars, `in`
arrays and `between` tuples are all covered at once. `findCursor` re-casts the
decoded cursor as well: a token stores dates as ISO strings, so page 2 of a
date-keyed feed crashed the same way.

Text-pattern operators (`like`/`contains`/…) are exempt, or `ilike` on a date
column would receive `String(Date)` instead of the caller's string. The list lives
in core as `TEXT_FILTER_OPERATORS` so the two adapters cannot diverge on it.

A value that cannot be cast now drops the condition instead of reaching the
driver — the same contract `operators.ts` already used for a non-array `in`. One
bad element invalidates a whole `in` list, so a half-applied filter cannot
silently widen a result set. Phase 05's `onSkippedCondition` makes these visible.

The mongoose adapter gets the same layer with the same function names, scoped to
`Date` paths so both adapters judge exactly the same set of values. A text pattern
on a `Date` path is now skipped rather than raising `Can't use $options with
Date` — that crash predates this change.

Also in core: `createFilters` was missing `notBetween` while both adapters
implement the operator.
