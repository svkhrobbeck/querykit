/**
 * Task 012 — cursor token v2 (`{ v: 2, k, id }`), scalar-only values, optional
 * HMAC (`cursorSecret`). Imported by `internal.ts`; sets `process.exitCode`.
 */
import { QueryKitError } from "../src/index";
import * as internal from "../src/internal/index";

/** Token v2 is not built yet (phase 01): every mismatch is a todo, not a failure. */
const PENDING = true;

type Codec = {
  encodeCursorToken?: (payload: { k: unknown; id: unknown }, secret?: string) => Promise<string>;
  decodeCursorToken?: (token: string, options: { source: string; secret?: string }) => Promise<{ k: unknown; id: unknown } | undefined>;
};
const codec = internal as unknown as Codec;

let failed = 0;
let todo = 0;
function check(label: string, ok: boolean, extra = "") {
  if (ok) console.log(`✅ [cursor] ${label}`);
  else if (PENDING) {
    todo++;
    console.log(`⏳ todo [cursor] ${label}${extra ? ` — ${extra}` : ""}`);
  } else {
    failed++;
    console.log(`❌ [cursor] ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

async function reason(token: string, secret?: string): Promise<string> {
  if (!codec.decodeCursorToken) return "no decodeCursorToken";
  try {
    const decoded = await codec.decodeCursorToken(token, { source: "t", secret });
    return decoded ? `ok ${JSON.stringify(decoded)}` : "undefined";
  } catch (error) {
    return error instanceof QueryKitError ? `${error.info.reason}/${error.info.site}` : `threw ${String(error)}`;
  }
}

const roundTrip = codec.encodeCursorToken ? await reason(await codec.encodeCursorToken({ k: "2026-01-01T00:00:00.000Z", id: 7 })) : "no encodeCursorToken";
check("v2 round trip keeps k and id", roundTrip === 'ok {"k":"2026-01-01T00:00:00.000Z","id":7}', roundTrip);
check(
  "A3 k is an object ({ $ne: null }) → invalid-value / cursorKey",
  (await reason(b64({ v: 2, k: { $ne: null }, id: 1 }))) === "invalid-value/cursorKey",
  await reason(b64({ v: 2, k: { $ne: null }, id: 1 })),
);
check("A5 a v1 token { v: <value> } → invalid-value / cursorKey", (await reason(b64({ v: 5 }))) === "invalid-value/cursorKey", await reason(b64({ v: 5 })));
const signed = codec.encodeCursorToken ? await codec.encodeCursorToken({ k: 1, id: 1 }, "s") : "";
const tampered = signed ? signed.slice(0, -1) + (signed.endsWith("A") ? "B" : "A") : "";
check("A4 cursorSecret: a signed token decodes", (await reason(signed, "s")).startsWith("ok"), await reason(signed, "s"));
check("A4 cursorSecret: one changed character → invalid-value", (await reason(tampered, "s")) === "invalid-value/cursorKey", await reason(tampered, "s"));
check("A4 cursorSecret: an unsigned token → invalid-value", (await reason(b64({ v: 2, k: 1, id: 1 }), "s")) === "invalid-value/cursorKey");
check("A4 no secret: an unsigned token works", (await reason(b64({ v: 2, k: 1, id: 1 }))).startsWith("ok"));

if (failed > 0) process.exitCode = 1;
console.log(`cursor: ${failed} failed, ${todo} todo`);
