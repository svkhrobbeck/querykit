import { AsyncLocalStorage } from "node:async_hooks";

/**
 * A Prisma client or interactive-transaction client. The adapter only ever needs
 * model delegates off it, so it is kept structural — this file never imports
 * `@prisma/client` (see the package README: the generated client is a peer).
 */
export type AnyExecutor = Record<string, unknown>;

/**
 * Per-transaction ambient state. Lets repositories pick up the active
 * transaction client without threading it through every call. Set by
 * `registry.transaction`.
 */
export interface RepoContext {
  executor?: AnyExecutor;
}

export interface ContextStore {
  /** Read the current ambient context (undefined outside any `run`). */
  get(): RepoContext | undefined;
  /** Run `fn` with `patch` merged over the current context. */
  run<T>(patch: RepoContext, fn: () => T): T;
}

export function createContextStore(): ContextStore {
  const als = new AsyncLocalStorage<RepoContext>();
  return {
    get: () => als.getStore(),
    run: (patch, fn) => als.run({ ...als.getStore(), ...patch }, fn),
  };
}
