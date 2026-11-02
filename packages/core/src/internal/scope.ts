/**
 * A repository `scope` (the server's RBAC / tenancy filter) split once for every
 * adapter (task 014): equality values and `{ in: [...] }` lists.
 */

/** One scope condition, in the shape every adapter's `buildWhere` reads. */
export interface ScopeCondition {
  key: string;
  operation: "=" | "in";
  value: unknown;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/** `{ in: [...] }` — and nothing else — is a list scope; any other value is equality (as before). */
const isInScope = (value: unknown): value is { in: readonly unknown[] } => isPlainObject(value) && Object.keys(value).length === 1 && Array.isArray(value.in);

/** The scope as conditions: `{ k: v }` → `k = v`, `{ k: { in: [...] } }` → `k in [...]`. */
export function scopeConditions(scope: Record<string, unknown> | undefined): ScopeCondition[] {
  return Object.entries(scope ?? {}).map(([key, value]) =>
    isInScope(value) ? { key, operation: "in", value: [...value.in] } : { key, operation: "=", value },
  );
}

/** The values `create` / `upsert` fill in: the equality scopes only (a list has no single value). */
export function scopeDefaults(scope: Record<string, unknown> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(scope ?? {}).filter(([, value]) => !isInScope(value)));
}
