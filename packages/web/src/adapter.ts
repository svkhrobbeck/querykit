/**
 * Per-backend `with` (relation-loading) config shapes. querykit unifies
 * filter/sort/pagination, but relation loading differs per ORM — so the registry
 * types `with` from the chosen `adapter`. Only JSON-serializable, wire-safe
 * options are typed; function callbacks (e.g. Drizzle `where: (f,op)=>…`) and raw
 * SQL are deliberately **never** included — you can't send them over JSON.
 */

/** Mongoose `populate` config (serializable subset). */
export interface MongoosePopulate {
  select?: string;
  match?: Record<string, unknown>;
  options?: Record<string, unknown>;
  populate?: string | MongoosePopulate | Record<string, boolean | MongoosePopulate>;
}

/** Drizzle relational `with` config (serializable subset — no `where`/`orderBy` fns, no SQL). */
export interface DrizzleWith {
  columns?: Record<string, boolean>;
  with?: Record<string, boolean | DrizzleWith>;
  limit?: number;
  offset?: number;
}

/** Prisma relation config (serializable subset). */
export interface PrismaInclude {
  select?: Record<string, boolean>;
  include?: Record<string, boolean | PrismaInclude>;
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  take?: number;
  skip?: number;
}

/** Supported registry backend adapters. */
export type AdapterName = "mongoose" | "drizzle-pg" | "drizzle-sqlite" | "prisma-pg";

/** The per-relation `with` value shape for each adapter. */
export interface AdapterWithConfig {
  mongoose: boolean | MongoosePopulate;
  "drizzle-pg": boolean | DrizzleWith;
  "drizzle-sqlite": boolean | DrizzleWith;
  "prisma-pg": boolean | PrismaInclude;
}

/** `with` map typed for an adapter: relation name → its config (boolean or object). */
export type WithFor<A extends AdapterName> = Record<string, AdapterWithConfig[A]>;
