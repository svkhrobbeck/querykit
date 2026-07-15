import { AsyncLocalStorage } from "node:async_hooks";

import type { ClientSession } from "mongoose";

/**
 * Per-transaction ambient state. Lets repositories pick up the active Mongo
 * `ClientSession` without threading it through every call. Set by
 * `registry.transaction`.
 */
export interface RepoContext {
  session?: ClientSession;
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
