/**
 * Task 021 B8 — every filter value is cast to its column's type before SQL is
 * built: a value PostgreSQL would reject is `invalid-value` (dropped and
 * reported, or `QueryKitError` under strict), never a 22P02 from the driver.
 * Imported by `sql.ts` (offline, in the gate); sets `process.exitCode` on failure.
 */
import { boolean, integer, pgEnum, pgTable, serial, text, uuid } from "drizzle-orm/pg-core";

import { castForColumn, INVALID_VALUE } from "../src/internal/coerce";

const status = pgEnum("cast_status", ["active", "blocked"]);
const things = pgTable("cast_things", {
  id: serial("id").primaryKey(),
  count: integer("count"),
  active: boolean("active"),
  ref: uuid("ref"),
  state: status("state"),
  label: text("label", { enum: ["a", "b"] }),
  note: text("note"),
});

let failed = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "✅" : "❌"} [cast] ${label}`);
  if (!ok) failed++;
}
const invalid = (column: Parameters<typeof castForColumn>[0], value: unknown) => castForColumn(column, value) === INVALID_VALUE;

check(
  "integer: 'abc' is invalid, '7' becomes 7, 7 stays",
  invalid(things.count, "abc") && castForColumn(things.count, "7") === 7 && castForColumn(things.count, 7) === 7,
);
check(
  "boolean: 'maybe' is invalid, 'true' / false pass",
  invalid(things.active, "maybe") && castForColumn(things.active, "true") === true && castForColumn(things.active, false) === false,
);
check(
  "uuid: 'not-a-uuid' is invalid, a uuid passes",
  invalid(things.ref, "not-a-uuid") && castForColumn(things.ref, "0f8fad5b-d9cb-469f-a165-70867728950e") === "0f8fad5b-d9cb-469f-a165-70867728950e",
);
check("pgEnum: a value outside the enum is invalid", invalid(things.state, "deleted") && castForColumn(things.state, "active") === "active");
check("text enum: a value outside the enum is invalid", invalid(things.label, "c") && castForColumn(things.label, "a") === "a");
check("plain text: any string passes, a number becomes text", castForColumn(things.note, "x") === "x" && castForColumn(things.note, 5) === "5");
check(
  "null passes on every type (isNull semantics)",
  [things.count, things.active, things.ref, things.state].every(column => castForColumn(column, null) === null),
);

if (failed > 0) process.exitCode = 1;
