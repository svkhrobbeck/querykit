/**
 * Opaque cursor tokens for keyset pagination. A token is the base64url encoding
 * of `{ v: <cursor field value> }`. Dates are preserved via ISO strings.
 *
 * ⚠️ Byte-for-byte identical to `@querykitjs/drizzle-pg` and `@querykitjs/mongoose`
 * — a token issued by one adapter must be readable by another, so this file is
 * deliberately kept unchanged across the three backends (see test/contract.ts).
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
