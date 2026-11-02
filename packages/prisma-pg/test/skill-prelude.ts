/**
 * Fixtures the `querykit-prisma-pg` skill examples import as `@querykitjs/prisma-pg/skill-prelude`
 * (`bun run test:skills`, after `test:generate`). Test-only — never published (see package.json "files").
 * Models: `User` (id, name, email, age?, secret?, createdAt, posts) and `Post` (id, title, authorId,
 * author, createdAt, updatedAt?, deletedAt?) — `test/prisma/schema.prisma`.
 */
export { createTestClient, PrismaClient } from "./prisma/client";
