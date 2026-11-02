import type { Model } from "mongoose";
import type * as Core from "@querykitjs/core";

import type { RelationDocs, RelationMap, Repository, RepositoryOptions } from "./repository";

/** {@link createRegistry} options — pagination defaults and bounds. */
export interface RegistryOptions {
  /** `findList` default page size (core `DEFAULT_PER_PAGE` = 20). */
  defaultPerPage?: number;
  /** `findInfinite`/`findCursor` default limit (core `DEFAULT_LIMIT` = 20). */
  defaultLimit?: number;
  /**
   * Upper bound for `perPage` (core `DEFAULT_MAX_PER_PAGE` = 200). Applied even
   * when validation was bypassed — defense in depth. Disable with `Infinity`.
   */
  maxPerPage?: number;
  /** Upper bound for `limit` (`findInfinite`/`findCursor`, core `DEFAULT_MAX_LIMIT` = 200). */
  maxLimit?: number;
  /**
   * **Strict mode.** An unknown filter/sort key, or a value the operator cannot
   * use, is no longer dropped silently — a `QueryKitError` is thrown (the backend
   * maps it to a 400). Defaults to `false`, keeping the legacy (DbService)
   * behaviour that dozens of existing endpoints rely on.
   *
   * Why it matters: a filter is meant to **narrow** a result set, so a mistyped
   * key that vanishes silently makes the endpoint return **more** data than
   * intended, with nothing in the log to show it.
   */
  strict?: boolean;
  /**
   * Called for every dropped condition (also when `strict` is off). Migration
   * path: watch with the hook first, flip `strict: true` once the log is clean.
   */
  onSkippedCondition?: (info: Core.SkippedCondition) => void;
  /**
   * Server-side request limits (core `DEFAULT_QUERY_LIMITS`) — enforced even when
   * validation was bypassed. Past one ⇒ `QueryKitError` (`reason: "limit-exceeded"`).
   * A repository's own `limits` win.
   */
  limits?: Partial<Core.QueryLimits>;
  /**
   * Time limit for every read (`find`, `findOne`, `countDocuments`, `aggregate`), in ms.
   * Default `2000`. Past it MongoDB aborts the read and the repository throws
   * `QueryKitTimeoutError` (`code: "QUERYKIT_TIMEOUT"`). A repository's own `maxTimeMS` wins.
   */
  maxTimeMS?: number;
  /**
   * Signs cursor tokens (HMAC-SHA256, task 012). With it a token that was not
   * issued by this server — or was changed — is `invalid-value`.
   */
  cursorSecret?: string;
  /**
   * The createdAt / deletedAt field names (task 014; default `createdAt`, `deletedAt`): the default
   * sort and the default `sortable` use `createdAt`, soft delete uses `deletedAt`.
   */
  timestamps?: { createdAt?: string; deletedAt?: string };
}

/** Extends a base repository with custom, model-specific methods (drizzle-pg style). */
export type RepositoryExtender<TDoc, TRel extends Record<string, unknown>, TExt extends Record<string, unknown>> = (base: Repository<TDoc, TRel>) => TExt;

/** DB registry: created once, yields model repositories. */
export interface Registry {
  /** Repository for a model. */
  repository<TDoc>(model: Model<TDoc>): Repository<TDoc>;

  /** …extended with custom methods (2nd-arg extender fn — same as drizzle-pg). */
  repository<TDoc, TExt extends Record<string, unknown>>(
    model: Model<TDoc>,
    extend: RepositoryExtender<TDoc, Record<never, never>, TExt>,
  ): Repository<TDoc> & TExt;

  /** …with typed relations so populated `with` fields are typed. */
  repository<TDoc, TRel extends RelationMap>(model: Model<TDoc>, options: RepositoryOptions<TDoc, TRel>): Repository<TDoc, RelationDocs<TRel>>;

  /** …with both typed relations and custom methods. */
  repository<TDoc, TRel extends RelationMap, TExt extends Record<string, unknown>>(
    model: Model<TDoc>,
    options: RepositoryOptions<TDoc, TRel>,
    extend: RepositoryExtender<TDoc, RelationDocs<TRel>, TExt>,
  ): Repository<TDoc, RelationDocs<TRel>> & TExt;

  /** Runs `fn` inside a MongoDB transaction (requires a replica set). */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
