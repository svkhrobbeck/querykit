/**
 * Per-async-call repository context (the transaction executor or session), so a
 * repository called inside `registry.transaction(...)` joins the transaction
 * without threading it through every call. Each adapter supplies its own context
 * shape (`{ executor }` for SQL clients, `{ session }` for mongoose).
 *
 * `node:async_hooks` is loaded when a store is created (adapters, on the server),
 * not imported statically: the validators also import `@querykitjs/core/internal`
 * for the limit helpers, and a static import of a node built-in would stop a
 * browser bundle of `@querykitjs/zod` / `@querykitjs/class-validator` (task 016).
 */
import type { AsyncLocalStorage as AsyncLocalStorageType } from "node:async_hooks";

export interface ContextStore<TContext extends object> {
  get(): TContext | undefined;
  /** Run `fn` with `patch` merged over the current context. */
  run<T>(patch: TContext, fn: () => T): T;
}

/** Node ≥ 22.3 and Bun (`engines` ≥ 22.12); anywhere else the adapter cannot start. */
function loadAsyncLocalStorage(): typeof AsyncLocalStorageType {
  const asyncHooks =
    typeof process !== "undefined" && typeof process.getBuiltinModule === "function" ? process.getBuiltinModule("node:async_hooks") : undefined;
  if (!asyncHooks?.AsyncLocalStorage)
    throw new Error("querykit: the repository context needs node:async_hooks (Node >= 22.12 or Bun) — a querykit adapter cannot run in this runtime");
  return asyncHooks.AsyncLocalStorage;
}

export function createContextStore<TContext extends object>(): ContextStore<TContext> {
  const AsyncLocalStorage = loadAsyncLocalStorage();
  const als = new AsyncLocalStorage<TContext>();
  return {
    get: () => als.getStore(),
    run: (patch, fn) => als.run({ ...als.getStore(), ...patch }, fn),
  };
}
