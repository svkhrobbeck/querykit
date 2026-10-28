/**
 * Evaluates the Prisma `where` / `orderBy` / `select` the adapter builds against
 * fixture rows, with the semantics of the SQL Prisma generates for PostgreSQL:
 * three-valued logic, `contains`-style filters as escaped LIKE (case-insensitive
 * with `mode: "insensitive"`), PostgreSQL null ordering. Test-only.
 */
import {
  and3,
  escapeLike,
  not3,
  or3,
  pgOrder,
  pick,
  sortRows,
  sqlCompare,
  sqlIn,
  sqlLike,
  type Direction,
  type Tri,
} from "../../core/test/conformance/semantics";

type Row = Record<string, unknown>;
type Filter = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Filter => typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);
/** One field's filter object (`{ equals, not, gt, in, contains, mode, … }`) or a bare value. */
function evalField(stored: unknown, filter: unknown): Tri {
  if (filter === null) return stored === null || stored === undefined;
  if (!isPlainObject(filter)) return sqlCompare(stored, filter, order => order === 0);
  const insensitive = filter.mode === "insensitive";
  const parts: Tri[] = [];
  for (const [operator, operand] of Object.entries(filter)) {
    switch (operator) {
      case "mode":
        break;
      case "equals":
        parts.push(evalField(stored, operand));
        break;
      case "not":
        parts.push(operand === null ? stored !== null && stored !== undefined : not3(evalField(stored, operand)));
        break;
      case "gt":
        parts.push(sqlCompare(stored, operand, order => order > 0));
        break;
      case "gte":
        parts.push(sqlCompare(stored, operand, order => order >= 0));
        break;
      case "lt":
        parts.push(sqlCompare(stored, operand, order => order < 0));
        break;
      case "lte":
        parts.push(sqlCompare(stored, operand, order => order <= 0));
        break;
      case "in":
        parts.push(sqlIn(stored, operand));
        break;
      case "notIn":
        parts.push(not3(sqlIn(stored, operand)));
        break;
      case "contains":
        parts.push(sqlLike(stored, `%${escapeLike(String(operand))}%`, insensitive));
        break;
      case "startsWith":
        parts.push(sqlLike(stored, `${escapeLike(String(operand))}%`, insensitive));
        break;
      case "endsWith":
        parts.push(sqlLike(stored, `%${escapeLike(String(operand))}`, insensitive));
        break;
      default:
        throw new Error(`fake-prisma: unsupported field filter "${operator}"`);
    }
  }
  return and3(parts);
}

export function evalWhere(where: Filter | undefined, row: Row): Tri {
  if (!where) return true;
  const parts: Tri[] = [];
  for (const [key, value] of Object.entries(where)) {
    if (key === "AND") parts.push(and3(asList(value).map(item => evalWhere(item as Filter, row))));
    else if (key === "OR") parts.push(or3(asList(value).map(item => evalWhere(item as Filter, row))));
    else if (key === "NOT") parts.push(and3(asList(value).map(item => not3(evalWhere(item as Filter, row)))));
    else parts.push(evalField(row[key], value));
  }
  return and3(parts);
}

export interface FindManyArgs {
  where?: Filter;
  orderBy?: Record<string, Direction> | Array<Record<string, Direction>>;
  skip?: number;
  take?: number;
  select?: Record<string, boolean>;
}

/** `delegate.findMany(args)` on fixture rows. */
export function findMany<T extends Row>(rows: readonly T[], args: FindManyArgs = {}): Row[] {
  const filtered = rows.filter(row => evalWhere(args.where, row) === true);
  const keys = (args.orderBy ? asList(args.orderBy) : []).flatMap(item =>
    Object.entries(item as Record<string, Direction>).map(([key, direction]) => ({ key, direction })),
  );
  const ordered = sortRows(filtered, keys, pgOrder);
  const skip = args.skip ?? 0;
  const page = ordered.slice(skip, args.take === undefined ? undefined : skip + args.take);
  const selected = Object.keys(args.select ?? {}).filter(key => args.select![key]);
  return selected.length > 0 ? page.map(row => pick(row, selected)) : page;
}

export function count<T extends Row>(rows: readonly T[], args: { where?: Filter } = {}): number {
  return rows.filter(row => evalWhere(args.where, row) === true).length;
}
