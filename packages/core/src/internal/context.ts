/**
 * Per-async-call repository context (the transaction executor or session), so a
 * repository called inside `registry.transaction(...)` joins the transaction
 * without threading it through every call. Each adapter supplies its own context
 * shape (`{ executor }` for SQL clients, `{ session }` for mongoose).
 *
 * `node:async_hooks` is imported only by this `@querykitjs/core/internal` entry;
 * the main `@querykitjs/core` entry stays runtime-neutral.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface ContextStore<TContext extends object> {
  get(): TContext | undefined;
  /** Run `fn` with `patch` merged over the current context. */
  run<T>(patch: TContext, fn: () => T): T;
}

export function createContextStore<TContext extends object>(): ContextStore<TContext> {
  const als = new AsyncLocalStorage<TContext>();
  return {
    get: () => als.getStore(),
    run: (patch, fn) => als.run({ ...als.getStore(), ...patch }, fn),
  };
}
