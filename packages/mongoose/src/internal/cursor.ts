/**
 * Opaque cursor tokens for keyset pagination. A token is the base64url encoding
 * of `{ v: <cursor field value> }`. Dates/ObjectIds are preserved as strings and
 * re-cast to the field's type on decode (see `castValue`).
 */

interface CursorPayload {
  v: unknown;
}

export function encodeCursor(value: unknown): string {
  const normalized = value instanceof Date ? value.toISOString() : value;
  const json = JSON.stringify({ v: normalized } satisfies CursorPayload);
  return Buffer.from(json, "utf8").toString("base64url");
}

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
