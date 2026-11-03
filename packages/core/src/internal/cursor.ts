/**
 * Opaque cursor tokens for keyset pagination, shared by every adapter so a token
 * is interchangeable between them. A token is the base64url encoding of
 * `{ v: <cursor value> }`; dates travel as ISO strings.
 */

import { QueryKitError } from "../errors";

interface CursorPayload {
  v: unknown;
}

export function encodeCursor(value: unknown): string {
  const normalized = value instanceof Date ? value.toISOString() : value;
  const json = JSON.stringify({ v: normalized } satisfies CursorPayload);
  return Buffer.from(json, "utf8").toString("base64url");
}

/** The cursor value, or `undefined` for a missing or undecodable token. */
export function decodeCursor(cursor?: string | null): unknown | undefined {
  if (!cursor) return undefined;
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const payload = JSON.parse(json) as CursorPayload;
    return payload.v;
  } catch {
    return undefined;
  }
}

/* ------------------------------- token v2 -------------------------------- */
/* `{ v: 2, k, id, s? }` — the cursor key's value and the primary key
 * (tie-break), both scalars; `s` is an HMAC-SHA256 signature when the registry
 * has a `cursorSecret`. Anything else is invalid-value on site cursorKey. */

export interface CursorToken {
  k: string | number | boolean;
  id: string | number | boolean;
}

const isScalar = (value: unknown): value is CursorToken["k"] =>
  typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

const scalarOf = (value: unknown): CursorToken["k"] | undefined => {
  // A Date becomes its ISO string; a driver id (a Mongo ObjectId) its own JSON form (hex).
  const normalized =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object" && value !== null && typeof (value as { toJSON?: unknown }).toJSON === "function"
        ? (value as { toJSON: () => unknown }).toJSON()
        : value;
  return isScalar(normalized) ? normalized : undefined;
};

async function sign(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Buffer.from(signature).toString("base64url");
}

/** Constant-time compare, so a forged signature cannot be found byte by byte. */
function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/** A v2 token for a row's cursor value and primary key; signed when `secret` is given. */
export async function encodeCursorToken(payload: { k: unknown; id: unknown }, secret?: string): Promise<string> {
  const body = JSON.stringify({ v: 2, k: scalarOf(payload.k) ?? null, id: scalarOf(payload.id) ?? null });
  const signed = secret ? JSON.stringify({ ...JSON.parse(body), s: await sign(body, secret) }) : body;
  return Buffer.from(signed, "utf8").toString("base64url");
}

/**
 * The `{ k, id }` of a v2 token, `undefined` for no token. A v1 token, a
 * non-scalar `k` / `id`, a missing or wrong signature (with `secret`) or
 * anything undecodable throws `QueryKitError` — invalid-value, site cursorKey,
 * `key` the cursor key in use (the same key as an adapter's cast error).
 */
export async function decodeCursorToken(
  token: string | null | undefined,
  options: { source: string; secret?: string; key?: string },
): Promise<CursorToken | undefined> {
  if (!token) return undefined;
  const refuse = (): never => {
    throw new QueryKitError({ source: options.source, site: "cursorKey", key: options.key ?? "cursor", reason: "invalid-value" });
  };
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return refuse();
  }
  if (typeof payload !== "object" || payload === null || payload.v !== 2 || !isScalar(payload.k) || !isScalar(payload.id)) return refuse();
  if (options.secret) {
    const body = JSON.stringify({ v: 2, k: payload.k, id: payload.id });
    if (typeof payload.s !== "string" || !sameSignature(payload.s, await sign(body, options.secret))) return refuse();
  }
  return { k: payload.k, id: payload.id };
}
