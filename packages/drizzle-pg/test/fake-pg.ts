/**
 * A tiny in-memory PostgreSQL for the conformance suite: it evaluates the WHERE
 * and ORDER BY SQL that drizzle renders (`PgDialect`) against fixture rows, with
 * SQL three-valued logic and PostgreSQL null ordering. It understands only the
 * grammar the adapter emits: column refs, `$n` params, comparisons, [NOT] LIKE /
 * ILIKE, [NOT] IN, [NOT] BETWEEN, IS [NOT] NULL, AND / OR / NOT, parentheses.
 * Test-only.
 */
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { and3, mongoOrder, not3, or3, pgOrder, sortRows, sqlCompare, sqlIn, sqlLike, type Direction, type Tri } from "../../core/test/conformance/semantics";

type Row = Record<string, unknown>;
type Token = { kind: "ident" | "param" | "punct" | "op" | "word"; text: string };

type Node =
  | { kind: "and" | "or"; items: Node[] }
  | { kind: "not"; item: Node }
  | { kind: "literal"; value: boolean }
  | { kind: "compare"; column: string; op: string; value: unknown }
  | { kind: "like"; column: string; pattern: unknown; caseInsensitive: boolean; negated: boolean }
  | { kind: "in"; column: string; values: unknown[]; negated: boolean }
  | { kind: "between"; column: string; min: unknown; max: unknown; negated: boolean }
  | { kind: "null"; column: string; negated: boolean };

const dialect = new PgDialect();

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*(?:"((?:[^"]|"")*)"|\$(\d+)|(<>|!=|>=|<=|=|>|<)|([(),.])|([A-Za-z_]+))/y;
  let match: RegExpExecArray | null;
  while (pattern.lastIndex < sql.length && (match = pattern.exec(sql))) {
    if (match[1] !== undefined) tokens.push({ kind: "ident", text: match[1].replace(/""/g, '"') });
    else if (match[2] !== undefined) tokens.push({ kind: "param", text: match[2] });
    else if (match[3] !== undefined) tokens.push({ kind: "op", text: match[3] });
    else if (match[4] !== undefined) tokens.push({ kind: "punct", text: match[4] });
    else tokens.push({ kind: "word", text: match[5]!.toLowerCase() });
  }
  if (pattern.lastIndex < sql.trimEnd().length) throw new Error(`fake-pg: cannot tokenize "${sql.slice(pattern.lastIndex)}"`);
  return tokens;
}

/** Recursive-descent parser over the rendered SQL; `columnKey` maps a DB column name to the row key. */
function parse(sql: string, params: unknown[], columnKey: (name: string) => string): Node {
  const tokens = tokenize(sql);
  let at = 0;
  const peek = (offset = 0) => tokens[at + offset];
  const isWord = (word: string, offset = 0) => peek(offset)?.kind === "word" && peek(offset)?.text === word;
  const next = (): Token => {
    const token = tokens[at++];
    if (!token) throw new Error(`fake-pg: unexpected end of "${sql}"`);
    return token;
  };
  const expect = (text: string) => {
    const token = next();
    if (token.text !== text) throw new Error(`fake-pg: expected "${text}", got "${token.text}" in "${sql}"`);
  };
  const param = (): unknown => {
    const token = next();
    if (token.kind !== "param") throw new Error(`fake-pg: expected a parameter, got "${token.text}"`);
    return params[Number(token.text) - 1];
  };
  const column = (): string => {
    let name = next().text;
    while (peek()?.text === ".") {
      at++;
      name = next().text;
    }
    return columnKey(name);
  };

  const predicate = (col: string): Node => {
    const token = next();
    if (token.kind === "op") return { kind: "compare", column: col, op: token.text, value: param() };
    if (token.text === "is") {
      const negated = isWord("not") ? (at++, true) : false;
      expect("null");
      return { kind: "null", column: col, negated };
    }
    const negated = token.text === "not";
    const keyword = negated ? next().text : token.text;
    if (keyword === "like" || keyword === "ilike") return { kind: "like", column: col, pattern: param(), caseInsensitive: keyword === "ilike", negated };
    if (keyword === "between") {
      const min = param();
      expect("and");
      return { kind: "between", column: col, min, max: param(), negated };
    }
    if (keyword === "in") {
      expect("(");
      const values = [param()];
      while (peek()?.text === ",") {
        at++;
        values.push(param());
      }
      expect(")");
      return { kind: "in", column: col, values, negated };
    }
    throw new Error(`fake-pg: unsupported predicate "${keyword}" in "${sql}"`);
  };

  const primary = (): Node => {
    if (peek()?.text === "(") {
      at++;
      const inner = orExpr();
      expect(")");
      return inner;
    }
    if (isWord("true") || isWord("false")) return { kind: "literal", value: next().text === "true" };
    return predicate(column());
  };
  const notExpr = (): Node => (isWord("not") ? (at++, { kind: "not", item: notExpr() }) : primary());
  const chain = (kind: "and" | "or", operand: () => Node): Node => {
    const items = [operand()];
    while (isWord(kind)) {
      at++;
      items.push(operand());
    }
    return items.length === 1 ? items[0]! : { kind, items };
  };
  const andExpr = () => chain("and", notExpr);
  const orExpr = () => chain("or", andExpr);

  const tree = orExpr();
  if (at !== tokens.length) throw new Error(`fake-pg: trailing tokens in "${sql}"`);
  return tree;
}

function evaluate(node: Node, row: Row): Tri {
  switch (node.kind) {
    case "and":
      return and3(node.items.map(item => evaluate(item, row)));
    case "or":
      return or3(node.items.map(item => evaluate(item, row)));
    case "not":
      return not3(evaluate(node.item, row));
    case "literal":
      return node.value;
    case "compare": {
      const tests: Record<string, (order: number) => boolean> = {
        "=": o => o === 0,
        "<>": o => o !== 0,
        "!=": o => o !== 0,
        ">": o => o > 0,
        ">=": o => o >= 0,
        "<": o => o < 0,
        "<=": o => o <= 0,
      };
      return sqlCompare(row[node.column], node.value, tests[node.op]!);
    }
    case "like": {
      const matched = sqlLike(row[node.column], node.pattern, node.caseInsensitive);
      return node.negated ? not3(matched) : matched;
    }
    case "in": {
      const found = sqlIn(row[node.column], node.values);
      return node.negated ? not3(found) : found;
    }
    case "between": {
      const stored = row[node.column];
      const inside = and3([sqlCompare(stored, node.min, o => o >= 0), sqlCompare(stored, node.max, o => o <= 0)]);
      return node.negated ? not3(inside) : inside;
    }
    case "null": {
      const isNull = row[node.column] === null || row[node.column] === undefined;
      return node.negated ? !isNull : isNull;
    }
  }
}

/** Rows where the rendered condition is TRUE. */
export function filterRows<T extends Row>(rows: readonly T[], where: SQL | undefined, columnKey: (name: string) => string): T[] {
  if (!where) return [...rows];
  const { sql, params } = dialect.sqlToQuery(where);
  const tree = parse(sql, params as unknown[], columnKey);
  return rows.filter(row => evaluate(tree, row) === true);
}

/** Rows in the order of drizzle `orderBy` SQL items (`"t"."col" asc|desc`). */
export function orderRows<T extends Row>(rows: readonly T[], orderBy: readonly SQL[] | undefined, columnKey: (name: string) => string): T[] {
  if (!orderBy || orderBy.length === 0) return [...rows];
  const keys = orderBy.map(item => {
    const { sql } = dialect.sqlToQuery(item);
    const match = /"([^"]+)"\s+(asc|desc)(?:\s+nulls\s+(first|last))?$/i.exec(sql.trim());
    if (!match) throw new Error(`fake-pg: unsupported ORDER BY "${sql}"`);
    const direction = match[2]!.toLowerCase() as Direction;
    const nulls = match[3]?.toLowerCase();
    // `asc nulls first` / `desc nulls last` is MongoDB's order; bare asc/desc is PostgreSQL's.
    const mongoStyle = nulls === undefined ? false : (direction === "asc") === (nulls === "first");
    if (nulls !== undefined && !mongoStyle) throw new Error(`fake-pg: unsupported NULLS order "${sql}"`);
    return { key: columnKey(match[1]!), direction, mongoStyle };
  });
  const explicit = keys.filter(k => k.mongoStyle).length;
  if (explicit !== 0 && explicit !== keys.length) throw new Error("fake-pg: mixed NULLS orders in one ORDER BY");
  return sortRows(rows, keys, explicit ? mongoOrder : pgOrder);
}
