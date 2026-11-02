/**
 * The branded raw-filter escape hatch (REQUIREMENTS R19). A driver's own `where`
 * object (Prisma `where`, Mongo filter) is accepted inside a querykit filter only
 * when server code wraps it in `raw(...)`: the brand is a `Symbol`, which no JSON
 * body can carry. An unbranded plain object is refused (`forbidden-key`).
 *
 * ⚠️ A raw node is server code — the `filterable` policy does **not** look inside it.
 * Never build one from request data.
 */
const RAW = Symbol.for("querykit.raw");

/**
 * Brand a driver-native filter object so an adapter accepts it as a filter node.
 * The object itself is returned (non-enumerable brand), so the driver receives
 * exactly what you wrote.
 *
 * @example
 * ```ts
 * import { raw } from "@querykitjs/core";
 * repo.findAll({ filter: { and: [{ key: "status", value: "active" }, raw({ posts: { some: { published: true } } })] } });
 * ```
 */
export function raw<T extends object>(value: T): T {
  Object.defineProperty(value, RAW, { value: true, enumerable: false });
  return value;
}

/** Whether a filter node was branded with {@link raw}. */
export const isRaw = (node: unknown): boolean => typeof node === "object" && node !== null && (node as Record<symbol, unknown>)[RAW] === true;
