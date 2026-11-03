# querykit

> Typed repository layer for ORMs — advanced filtering, flexible pagination, and more.

`querykit` is a family of packages that give your ORM a powerful, typed repository
layer: nested filters, three pagination styles (offset / infinite / cursor),
transactions, RBAC scoping, soft-delete, bulk upserts, and aggregation — with
result types inferred automatically.

## Packages

| Package                                                     | Status       | Description                                                                                                                    |
| ----------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| [`@querykitjs/core`](./packages/core)                       | ✅ available | ORM-agnostic DSL: filters, operators, wire types (shared)                                                                      |
| [`@querykitjs/drizzle-pg`](./packages/drizzle-pg)           | ✅ available | Drizzle ORM + PostgreSQL (backend repository)                                                                                  |
| [`@querykitjs/prisma-pg`](./packages/prisma-pg)             | ✅ available | Prisma + PostgreSQL (backend repository)                                                                                       |
| [`@querykitjs/mongoose`](./packages/mongoose)               | ✅ available | Mongoose + MongoDB (backend repository)                                                                                        |
| [`@querykitjs/mongodb`](./packages/mongodb)                 | ✅ available | MongoDB official driver (backend repository, no mongoose)                                                                      |
| [`@querykitjs/web`](./packages/web)                         | ✅ available | Frontend query-building (filters, pagination, URL sync)                                                                        |
| [`@querykitjs/tanstack-query`](./packages/tanstack-query)   | ✅ available | Ready TanStack Query options from a web resource (list, infinite, cursor) — React, Vue, Solid, Svelte                          |
| [`@querykitjs/zod`](./packages/zod)                         | ✅ available | Zod schemas validating the request contract (backend)                                                                          |
| [`@querykitjs/class-validator`](./packages/class-validator) | ✅ available | class-validator decorators + DTOs for the same contract (Nest)                                                                 |
| [`@querykitjs/standard-schema`](./packages/standard-schema) | ✅ available | Standard Schema v1 validators for the same contract (valibot, arktype, Effect, Hono `sValidator`, tRPC) — no validator library |
| `@querykitjs/drizzle-sqlite`                                | 🚧 planned   | Drizzle ORM + SQLite                                                                                                           |
| `@querykitjs/prisma-sqlite`                                 | 🚧 planned   | Prisma + SQLite                                                                                                                |

Versions and changelogs live in each package (`packages/<name>/package.json`,
`packages/<name>/CHANGELOG.md`) and on npm. Every package has an English README
(`README.en.md`) next to its Uzbek one.

The backend adapters expose **the same surface** — same option names, same
semantics, same errors — so one frontend contract drives a Postgres backend
(drizzle, prisma) or a MongoDB backend (mongoose, the official driver). A shared
conformance suite runs the same cases against every adapter and keeps them equal.

## Requirements

- **Node.js** `>=22.12`.
- **Peer dependencies** (the ORM, the driver, zod, class-validator, React…) — a
  peer range covers up to the latest two majors (e.g. `react` `^18.3 || ^19.2.7`),
  and both ends of every range are tested. The exact ranges are in each package README, under
  _Requirements_ (e.g. [`@querykitjs/drizzle-pg`](./packages/drizzle-pg/README.en.md#requirements)).

## Safe by default

The request contract comes from the client, so the pieces that protect a response
live in the library rather than in every route:

- **Pagination and request size are capped** — `perPage` / `limit` up to 200
  (`DEFAULT_MAX_PER_PAGE`, `DEFAULT_MAX_LIMIT`), plus parse-time `limits` on filter
  depth, condition count, array items, string length, offset depth, sort fields
  and `like` wildcards (`DEFAULT_QUERY_LIMITS`). Raise one per schema or
  repository, never globally — [core › Limits](./packages/core/README.en.md#limits).
- **Filters and sorts are allow-listed** — `filterable` and `sortable` on a
  repository. Without them a client may filter only the allowed columns, and only
  with `=` / `in`; sorting is open on the primary key and `createdAt`. Anything
  else is refused before the database is called —
  [drizzle-pg › Safe by default](./packages/drizzle-pg/README.en.md#safe-by-default--filterable-sortable-limits),
  [mongodb › Safe by default](./packages/mongodb/README.en.md#safe-by-default--filterable-sortable-limits).
- **A raw driver filter is server code** — a Prisma `where` or a Mongo filter is
  accepted only when branded with `raw()` from `@querykitjs/core`; a plain object
  from a JSON body is refused —
  [prisma-pg › Raw `where`](./packages/prisma-pg/README.en.md#raw-where-escape-hatch).
- **Projection is server-owned** — `forcedColumns` / `allowedColumns` bound what
  a client's `columns` may pick (a password column never comes out), and `with`
  opens only the relations listed in `relations` —
  [drizzle-pg › Typed relations](./packages/drizzle-pg/README.en.md#typed-relations--column-selection).
- **No accidental mass writes** — `updateWhere` / `deleteWhere` with an empty
  filter are refused; a write over every row needs `{ all: true }` —
  [drizzle-pg › Bulk update and delete](./packages/drizzle-pg/README.en.md#bulk-update-and-delete).
- **Dropped conditions are visible** — `onSkippedCondition` to watch them,
  `strict` to refuse them —
  [drizzle-pg › Bad conditions](./packages/drizzle-pg/README.en.md#4-bad-conditions-watch-them-or-refuse-them).
- **Cursors can be signed** — `cursorSecret` signs the cursor token with
  HMAC-SHA256, so a client cannot forge one —
  [drizzle-pg › Cursor](./packages/drizzle-pg/README.en.md#cursor-ties-and-signing).
- **MongoDB reads are time-boxed** — every read carries `maxTimeMS` (default
  2 000 ms) —
  [mongodb › Safe by default](./packages/mongodb/README.en.md#safe-by-default--filterable-sortable-limits).
- **Validators reject what they cannot trust** — `allowedKeys` in
  `@querykitjs/class-validator` refuses a filter on an unknown field, and
  `limits` (`maxDepth`, …) bound the payload in both validators —
  [class-validator › Safe by default](./packages/class-validator/README.en.md#safe-by-default),
  [zod › Limits](./packages/zod/README.en.md#limits).

## Agent skills

Every package ships an agent skill for AI coding assistants:
`skills/querykit-<package>/SKILL.md`. After an install it is at
`node_modules/@querykitjs/<package>/skills/querykit-<package>/SKILL.md` — point
your assistant at it, and the skill always matches the installed version.

## Development (monorepo)

Bun workspaces + [changesets](https://github.com/changesets/changesets).

```bash
bun install
bun run typecheck     # tsc --noEmit across packages (src + test)
bun run lint          # eslint (flat config)
bun run format:check  # prettier --check (bun run format writes)
bun run build         # tsup per package (ESM + CJS + .d.ts)

bun run changeset     # record a change for release
```

Tests are runnable scripts, not a framework. The offline set — the one every
change must pass — needs no service:

```bash
bun run --filter @querykitjs/core            test:smoke
bun run --filter @querykitjs/zod             test:smoke
bun run --filter @querykitjs/class-validator test:smoke
bun run --filter @querykitjs/web             test:smoke
bun run --filter @querykitjs/drizzle-pg      test:sql      # SQL/params via PgDialect, no DB
bun run --filter @querykitjs/prisma-pg       test:generate # then test:query, test:types, test:contract
bun run --filter @querykitjs/mongodb         test:unit

bun run test:conformance  # the same cases against every adapter
bun run test:skills       # agent skills: shape + every example typechecks
bun run test:treeshake    # no top-level side effects; each export bundles alone
bun run test:size         # bundle size budgets
bun run test:publish      # publint + are-the-types-wrong on every package
bun run test:publish-plan # what a release would publish
```

Peer ranges and real databases:

```bash
bun run test:matrix       # both ends of every peer range, oldest and newest TypeScript
bun run test:smoke:pg     # drizzle-pg + prisma-pg on a throw-away PostgreSQL (embedded-postgres)
bun run test:smoke:all    # test:smoke:pg + the mongoose and mongodb smokes (mongodb-memory-server)
```

`test:smoke:pg` starts its own temporary PostgreSQL cluster on a free local port
and removes it afterwards — no database or `DATABASE_URL` of yours is needed.

Release checks (read-only, they never publish):

```bash
bun run release:check     # every package: local version == npm latest?
bun run release:pending   # packages waiting for a publish
```

## License

MIT © Suhrobbek Soatov
