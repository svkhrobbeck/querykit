# querykit

> Typed repository layer for ORMs — advanced filtering, flexible pagination, and more.

`querykit` is a family of packages that give your ORM a powerful, typed repository
layer: nested filters, three pagination styles (offset / infinite / cursor),
transactions, RBAC scoping, soft-delete, bulk upserts, and aggregation — with
result types inferred automatically.

## Packages

| Package                                         | Status       | Description                                             |
| ----------------------------------------------- | ------------ | ------------------------------------------------------- |
| [`@querykit/drizzle-pg`](./packages/drizzle-pg) | ✅ available | Drizzle ORM + PostgreSQL (backend repository)           |
| [`@querykit/web`](./packages/web)               | ✅ available | Frontend query-building (filters, pagination, URL sync) |
| `@querykit/core`                                | 🚧 planned   | ORM-agnostic filter DSL, pagination & types             |
| `@querykit/drizzle-sqlite`                      | 🚧 planned   | Drizzle ORM + SQLite                                    |
| `@querykit/prisma-pg`                           | 🚧 planned   | Prisma + PostgreSQL                                     |

Shared logic is moved into `@querykit/core` gradually as it emerges.

## Development (monorepo)

Bun workspaces + [changesets](https://github.com/changesets/changesets).

```bash
bun install
bun run typecheck     # tsc --noEmit across packages
bun run lint          # eslint (flat config)
bun run build         # tsup per package (ESM + CJS + .d.ts)
bun run format        # prettier

bun run changeset     # record a change for release
```

## License

MIT © Suhrobbek Soatov
