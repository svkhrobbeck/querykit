/**
 * The client's `with` against the repository's `relations` allow-list (R21),
 * one walker for every adapter. Each adapter names its own option keys (a "dialect");
 * the rules are the same: an unlisted relation, column, filter field, nested relation
 * or option is `QueryKitError` `forbidden-key`, `site: "with"`, before the driver runs.
 */
import { QueryKitError } from "../errors";
import type { RelationRule, Relations } from "../types";

/** How one adapter spells a relation's options. */
export interface WithDialect {
  /** Column selection: drizzle `columns`, prisma / mongoose `select`. */
  columns: string;
  /** Nested relations: drizzle `with`, prisma `include`, mongoose `populate`. */
  nested: string;
  /** Row filters: prisma `where`, mongoose `match`; drizzle none (its `where` is code, not JSON). */
  filters: readonly string[];
  /** Logical keys inside a filter, walked into: prisma `AND` / `OR` / `NOT`, mongoose `$and` / `$or` / `$nor`. */
  logical: readonly string[];
  /** Options that only page: drizzle `limit` / `offset`, prisma `take` / `skip`, mongoose `options.limit` / `options.skip`. */
  paging: readonly string[];
  /** A sort whose keys must be allowed columns: prisma `orderBy`. */
  orderBy?: string;
  /** An options bag whose keys must be `paging` keys: mongoose `options`. */
  options?: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/** A rule that opens a relation: an object with `columns` (a list or `"*"`). A bare model (mongoose shorthand) does not. */
const ruleOf = (relations: Relations | undefined, name: string): RelationRule | undefined => {
  const rule = relations && Object.prototype.hasOwnProperty.call(relations, name) ? (relations as Record<string, unknown>)[name] : undefined;
  return isPlainObject(rule) && (rule.columns === "*" || Array.isArray(rule.columns)) ? (rule as unknown as RelationRule) : undefined;
};

/** Keys named by a selection: `{ a: true, b: 1 }` or mongoose's `"a b -c"`. */
const selectedKeys = (selection: unknown): string[] | undefined => {
  if (typeof selection === "string") return selection.split(/\s+/).filter(Boolean);
  if (isPlainObject(selection)) return Object.keys(selection).filter(key => Boolean(selection[key]));
  return undefined;
};

/**
 * The checked `with`: every relation in `relations`, every selected column in its
 * `columns`, every filter field in its `filterable`, every nested relation in its
 * `nested`. A relation asked for with `true` (or without a selection) gets its
 * listed columns selected, so a column list is never widened to the full row.
 */
export function checkWith(
  withValue: unknown,
  relations: Relations | undefined,
  dialect: WithDialect,
  source: string,
  path = "",
): Record<string, unknown> | undefined {
  if (withValue === undefined || withValue === null) return undefined;
  const refuse = (key: string): never => {
    throw new QueryKitError({ source, site: "with", key: path + key, reason: "forbidden-key" });
  };
  if (!isPlainObject(withValue)) return refuse("with");

  const checked: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(withValue)) {
    if (value === false || value === undefined) continue;
    const rule = ruleOf(relations, name) ?? refuse(name);
    const listed = rule.columns === "*" ? undefined : new Set(rule.columns);
    const selectListed = () => Object.fromEntries([...listed!].map(column => [column, true]));
    if (value === true) {
      checked[name] = listed ? { [dialect.columns]: selectListed() } : true;
      continue;
    }
    if (!isPlainObject(value)) refuse(name);
    const options = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, option] of Object.entries(options)) {
      const at = `${name}.${key}`;
      if (key === dialect.columns) {
        const keys = selectedKeys(option) ?? refuse(at);
        // An exclusion ("-secret") selects every other column: only with "*".
        for (const column of keys) if (listed && (column.startsWith("-") || !listed.has(column))) refuse(`${name}.${column}`);
        out[key] = option;
      } else if (key === dialect.nested) {
        out[key] = checkWith(option, rule.nested, dialect, source, `${name}.`);
      } else if (dialect.filters.includes(key)) {
        checkFilterFields(option, rule, dialect, (field: string) => refuse(`${name}.${field}`));
        out[key] = option;
      } else if (dialect.paging.includes(key)) {
        out[key] = option;
      } else if (key === dialect.orderBy) {
        for (const item of Array.isArray(option) ? option : [option]) {
          for (const column of selectedKeys(item) ?? refuse(at)) if (listed && !listed.has(column)) refuse(`${name}.${column}`);
        }
        out[key] = option;
      } else if (key === dialect.options) {
        for (const sub of Object.keys(isPlainObject(option) ? option : refuse(at))) if (!dialect.paging.includes(sub)) refuse(`${at}.${sub}`);
        out[key] = option;
      } else {
        refuse(at);
      }
    }
    if (listed && out[dialect.columns] === undefined) out[dialect.columns] = selectListed();
    checked[name] = out;
  }
  return checked;
}

/** Every field of a relation filter (through the logical keys) must be in `filterable`. */
function checkFilterFields(filter: unknown, rule: RelationRule, dialect: WithDialect, refuse: (field: string) => never): void {
  if (!isPlainObject(filter)) refuse("filter");
  for (const [key, value] of Object.entries(filter as Record<string, unknown>)) {
    if (dialect.logical.includes(key)) {
      for (const part of Array.isArray(value) ? value : [value]) checkFilterFields(part, rule, dialect, refuse);
    } else if (key.startsWith("$") || !rule.filterable || rule.filterable[key] === undefined) {
      // `$where`, `$expr` and any field outside the allow-list.
      refuse(key);
    }
  }
}
