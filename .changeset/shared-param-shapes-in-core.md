---
"@querykitjs/core": minor
"@querykitjs/drizzle-pg": patch
"@querykitjs/mongoose": patch
"@querykitjs/web": patch
"@querykitjs/zod": patch
---

Apply the REVIEW.md follow-ups (retroactive changeset for a change that shipped
to `main` without one).

The param building blocks shared by every adapter — `Scope`, `UpsertOptions`,
`AggregateSpec` — moved into `@querykitjs/core`; the adapters now re-specialize
them over their own key type instead of declaring their own copies. `web`'s
payload type declares `withDeleted`, and the cursor schema no longer inherits an
unused `sort`.

Type-level only: no runtime behaviour changed.
