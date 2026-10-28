/**
 * Opaque cursor tokens for keyset pagination, shared by every adapter so a token
 * is interchangeable between them. A token is the base64url encoding of
 * `{ v: <cursor value> }`; dates travel as ISO strings.
 */

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
