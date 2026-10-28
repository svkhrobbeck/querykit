/**
 * The fixture client for every prisma-pg test, built the way Prisma 6.19 and 7
 * both accept: the `prisma-client` generator output plus a `@prisma/adapter-pg`
 * driver adapter (Prisma 7 requires one; the `datasources` option is gone).
 *
 * Offline tests never send a query, so the connection string only has to parse;
 * the DB smoke test passes a real one.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client";

export { PrismaClient };

export function createTestClient(connectionString = "postgresql://offline:offline@127.0.0.1:5432/offline"): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
