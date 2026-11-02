import type { Collection, Document } from "mongodb";
import type * as Core from "@querykitjs/core";

import type { Repository, RepositoryOptions } from "./repository";

/** Registry-wide defaults — the same names as the other adapters (REQUIREMENTS R11). */
export interface RegistryOptions {
  /** `findList` page size (core `DEFAULT_PER_PAGE`). */
  defaultPerPage?: number;
  /** `findInfinite` / `findCursor` page size (core `DEFAULT_LIMIT`). */
  defaultLimit?: number;
  /** `perPage` cap (core `DEFAULT_MAX_PER_PAGE`, 200). */
  maxPerPage?: number;
  /** `limit` cap (core `DEFAULT_MAX_LIMIT`, 200). */
  maxLimit?: number;
  /** A dropped condition throws `QueryKitError` instead of being reported. */
  strict?: boolean;
  onSkippedCondition?: (info: Core.SkippedCondition) => void;
  limits?: Partial<Core.QueryLimits>;
  /** Server time limit per read, in ms (default 2000). Past it: `QueryKitTimeoutError`. */
  maxTimeMS?: number;
  /** HMAC secret for cursor tokens; an unsigned token is refused. */
  cursorSecret?: string;
  /** createdAt / deletedAt field names (default `createdAt`, `deletedAt`). */
  timestamps?: { createdAt?: string; deletedAt?: string };
}

export type RepositoryExtender<TDoc extends Document, TExt extends Record<string, unknown>> = (base: Repository<TDoc>) => TExt;

export interface Registry {
  repository<TDoc extends Document>(collection: Collection<TDoc>, options: RepositoryOptions<TDoc>): Repository<TDoc>;
  repository<TDoc extends Document, TExt extends Record<string, unknown>>(
    collection: Collection<TDoc>,
    options: RepositoryOptions<TDoc>,
    extend: RepositoryExtender<TDoc, TExt>,
  ): Repository<TDoc> & TExt;

  /**
   * Run `fn` in one transaction (`client.withSession` + `withTransaction`); repositories called
   * inside join it. Needs a replica set or sharded cluster (MongoDB transactions).
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
