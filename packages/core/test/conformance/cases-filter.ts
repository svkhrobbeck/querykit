/** Filter cases: every operator, implicit AND, and/or/not groups. */
import { ALL, op, where, type ConformanceCase } from "./case-types";

export const OPERATOR_CASES: ConformanceCase[] = [
  op("= on a number", "age", "=", 25, ["Bob", "Eve_Ann"]),
  op("eq alias", "age", "eq", 30, ["Alice"]),
  op("!= drops NULL rows", "age", "!=", 25, ["Alice", "dave", "Frank"]),
  op("ne alias", "age", "ne", 30, ["Bob", "dave", "Eve_Ann", "Frank"]),
  op("> on a number", "age", ">", 25, ["Alice", "dave"]),
  op("gt alias", "age", "gt", 30, ["dave"]),
  op(">= on a number", "age", ">=", 25, ["Alice", "Bob", "dave", "Eve_Ann"]),
  op("gte alias", "age", "gte", 41, ["dave"]),
  op("< on a number", "age", "<", 25, ["Frank"]),
  op("lt alias", "age", "lt", 30, ["Bob", "Eve_Ann", "Frank"]),
  op("<= on a number", "age", "<=", 25, ["Bob", "Eve_Ann", "Frank"]),
  op("lte alias", "age", "lte", 17, ["Frank"]),
  op("like is case-sensitive", "name", "like", "A%", ["Alice", "Alina"]),
  op("like with a lowercase pattern", "name", "like", "%a%", ["Carol", "dave", "Frank", "Alina"]),
  op("like _ is a one-character wildcard", "name", "like", "A_i%", ["Alice", "Alina"], {
    // B9: Prisma cannot express a one-character wildcard, so the condition is dropped and reported (README Limitations).
    expectFor: { "prisma-pg": { names: ALL, skipped: [{ site: "filter", key: "name", reason: "invalid-value" }] } },
  }),
  op("startsWith treats % literally (B7)", "name", "startsWith", "%", []),
  op("ilike is case-insensitive", "name", "ilike", "%A%", ["Alice", "Carol", "dave", "Eve_Ann", "Frank", "Alina"]),
  op("notLike drops matches", "name", "notLike", "%a%", ["Alice", "Bob", "Eve_Ann"]),
  op("contains is case-insensitive", "name", "contains", "AL", ["Alice", "Alina"]),
  op("%_% token = contains", "name", "%_%", "ar", ["Carol"]),
  op("contains treats _ literally", "name", "contains", "_", ["Eve_Ann"]),
  op("startsWith is case-insensitive", "name", "startsWith", "a", ["Alice", "Alina"]),
  op("%_ token = startsWith", "name", "%_", "D", ["dave"]),
  op("endsWith is case-insensitive", "name", "endsWith", "E", ["Alice", "dave"]),
  op("_% token = endsWith", "name", "_%", "nn", ["Eve_Ann"]),
  op("in", "age", "in", [17, 41], ["dave", "Frank"]),
  op("notIn drops NULL rows", "age", "notIn", [25, 30], ["dave", "Frank"]),
  op("between is inclusive", "age", "between", [25, 30], ["Alice", "Bob", "Eve_Ann"]),
  op("notBetween drops NULL rows", "age", "notBetween", [20, 35], ["dave", "Frank"]),
  op("isNull", "age", "isNull", undefined, ["Carol", "Alina"]),
  op("isNotNull", "age", "isNotNull", undefined, ["Alice", "Bob", "dave", "Eve_Ann", "Frank"]),
  {
    name: "operation defaults to =",
    group: "operator",
    ...where([{ key: "name", value: "Bob" }], ["Bob"]),
  },
  op(">= on a date with an ISO string", "createdAt", ">=", "2026-05-01T00:00:00.000Z", ["Eve_Ann", "Frank", "Alina"]),
  op("< on a date with an ISO string", "createdAt", "<", "2026-02-01T00:00:00.000Z", ["Alice"]),
  op("between on dates with ISO strings", "createdAt", "between", ["2026-02-01T00:00:00.000Z", "2026-04-30T00:00:00.000Z"], ["Bob", "Carol", "dave"]),
];

export const GROUP_CASES: ConformanceCase[] = [
  {
    name: "flat array is an implicit AND",
    group: "group",
    ...where(
      [
        { key: "age", operation: ">=", value: 25 },
        { key: "name", operation: "like", value: "%a%" },
      ],
      ["dave"],
    ),
  },
  {
    name: "and group",
    group: "group",
    ...where(
      {
        and: [
          { key: "age", operation: ">", value: 20 },
          { key: "name", operation: "ilike", value: "%e%" },
        ],
      },
      ["Alice", "dave", "Eve_Ann"],
    ),
  },
  {
    name: "or group",
    group: "group",
    ...where(
      {
        or: [
          { key: "age", operation: "=", value: 17 },
          { key: "age", operation: "isNull" },
        ],
      },
      ["Frank", "Carol", "Alina"],
    ),
  },
  {
    name: "not on one field drops NULL rows (three-valued logic)",
    group: "group",
    ...where({ not: { key: "age", operation: ">", value: 25 } }, ["Bob", "Eve_Ann", "Frank"]),
  },
  {
    name: "not over several fields drops rows where the inner group is unknown",
    group: "group",
    ...where(
      {
        not: {
          and: [
            { key: "name", operation: "=", value: "Carol" },
            { key: "age", operation: ">", value: 3 },
          ],
        },
      },
      ["Alice", "Bob", "dave", "Eve_Ann", "Frank", "Alina"],
    ),
  },
  {
    name: "not(and) over a NULL field is TRUE when the other side is FALSE (B10)",
    group: "group",
    // Carol: age NULL (unknown) AND name = Bob (false) = false → NOT = true.
    ...where(
      {
        not: {
          and: [
            { key: "age", operation: "=", value: 1 },
            { key: "name", operation: "=", value: "Bob" },
          ],
        },
      },
      ALL,
    ),
  },
  {
    name: "not(or) over a NULL field is FALSE when the other side is TRUE (B10)",
    group: "group",
    // Carol: age NULL (unknown) OR name = Carol (true) = true → NOT = false.
    ...where(
      {
        not: {
          or: [
            { key: "age", operation: "=", value: 1 },
            { key: "name", operation: "=", value: "Carol" },
          ],
        },
      },
      ["Alice", "Bob", "dave", "Eve_Ann", "Frank"],
    ),
  },
  {
    name: "nested or / and / not",
    group: "group",
    ...where(
      {
        or: [
          {
            and: [
              { key: "age", operation: ">=", value: 25 },
              { key: "age", operation: "<=", value: 30 },
            ],
          },
          { not: { key: "name", operation: "startsWith", value: "a" } },
        ],
      },
      ["Alice", "Bob", "Carol", "dave", "Eve_Ann", "Frank"],
    ),
  },
  { name: "empty filter returns every row", group: "group", ...where([], ALL) },
];
