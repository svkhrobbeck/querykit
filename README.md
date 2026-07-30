# querykit

> Typed repository layer for ORMs — advanced filtering, flexible pagination, and more.

`querykit` is a family of packages that give your ORM a powerful, typed repository
layer: nested filters, three pagination styles (offset / infinite / cursor),
transactions, RBAC scoping, soft-delete, bulk upserts, and aggregation — with
result types inferred automatically.

## Packages

| Package                                           | Status       | Description                                               |
| ------------------------------------------------- | ------------ | --------------------------------------------------------- |
| [`@querykitjs/core`](./packages/core)             | ✅ available | ORM-agnostic DSL: filters, operators, wire types (shared) |
| [`@querykitjs/drizzle-pg`](./packages/drizzle-pg) | ✅ available | Drizzle ORM + PostgreSQL (backend repository)             |
| [`@querykitjs/mongoose`](./packages/mongoose)     | ✅ available | Mongoose + MongoDB (backend repository)                   |
| [`@querykitjs/web`](./packages/web)               | ✅ available | Frontend query-building (filters, pagination, URL sync)   |
| [`@querykitjs/zod`](./packages/zod)               | ✅ available | Zod schemas validating the request contract (backend)     |
| `@querykitjs/drizzle-sqlite`                      | 🚧 planned   | Drizzle ORM + SQLite                                      |
| `@querykitjs/prisma-pg`                           | 🚧 planned   | Prisma + PostgreSQL                                       |

Shared logic is moved into `@querykitjs/core` gradually as it emerges. The two
backend adapters expose **the same surface** — same option names, same semantics —
so one frontend contract drives either a Postgres or a MongoDB backend.

## Safe by default

The request contract comes from the client, so the pieces that protect a response
live in the library rather than in every route:

- **Pagination is capped** — `DEFAULT_MAX_PER_PAGE` / `DEFAULT_MAX_LIMIT` (200) in
  core, enforced by the zod factories, both repositories, and the frontend
  builders. Uncapped pagination is a DoS surface.
- **Projection is server-owned** — `forcedColumns` / `allowedColumns` on a
  repository, so a client cannot ask for a password column. `columns` / `with` /
  `withDeleted` are absent from the zod factories unless explicitly allowed.
- **Dates arrive as strings** and are cast from the column/path type, so a wire
  filter on a timestamp works without app-side helpers.
- **Dropped conditions are visible** — `onSkippedCondition` to watch them,
  `strict` to refuse them. A mistyped filter key otherwise widens a result set in
  silence.

## Development (monorepo)

Bun workspaces + [changesets](https://github.com/changesets/changesets).

```bash
bun install
bun run typecheck     # tsc --noEmit across packages (src + test)
bun run lint          # eslint (flat config)
bun run build         # tsup per package (ESM + CJS + .d.ts)
bun run format        # prettier

bun run changeset     # record a change for release
```

Tests are runnable scripts, not a framework. The ones that need no service:

```bash
bun run --filter @querykitjs/core       test:smoke
bun run --filter @querykitjs/zod        test:smoke
bun run --filter @querykitjs/web        test:smoke
bun run --filter @querykitjs/drizzle-pg test:sql    # SQL/params via PgDialect, no DB
bun run --filter @querykitjs/mongoose   test:smoke  # spins up mongodb-memory-server
```

`@querykitjs/drizzle-pg`'s `test:smoke` needs a reachable Postgres:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/db bun run --filter @querykitjs/drizzle-pg test:smoke
```

## License

MIT © Suhrobbek Soatov
