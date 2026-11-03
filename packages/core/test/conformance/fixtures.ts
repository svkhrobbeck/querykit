/**
 * The rows every adapter's fake driver holds. Field names exist in all three
 * test models (drizzle table, Prisma `User`, mongoose schema): `id`, `name`,
 * `email`, `age` (nullable), `createdAt`.
 *
 * Shaped to expose real semantic edges: `null` ages (three-valued logic), a
 * lowercase name (case sensitivity), an underscore in a name (LIKE wildcards),
 * a repeated age (sort tie-breaks).
 */
export type ConformanceRow = {
  id: number;
  name: string;
  email: string;
  age: number | null;
  createdAt: Date;
};

export const ROWS: readonly ConformanceRow[] = [
  { id: 1, name: "Alice", email: "alice@example.com", age: 30, createdAt: new Date("2026-01-10T09:00:00.000Z") },
  { id: 2, name: "Bob", email: "bob@example.com", age: 25, createdAt: new Date("2026-02-15T09:00:00.000Z") },
  { id: 3, name: "Carol", email: "carol@example.com", age: null, createdAt: new Date("2026-03-20T09:00:00.000Z") },
  { id: 4, name: "dave", email: "dave@example.com", age: 41, createdAt: new Date("2026-04-05T09:00:00.000Z") },
  { id: 5, name: "Eve_Ann", email: "eve@example.com", age: 25, createdAt: new Date("2026-05-01T09:00:00.000Z") },
  { id: 6, name: "Frank", email: "frank@example.com", age: 17, createdAt: new Date("2026-06-30T09:00:00.000Z") },
  { id: 7, name: "Alina", email: "alina@example.com", age: null, createdAt: new Date("2026-07-04T09:00:00.000Z") },
];

const copy = (rows: readonly ConformanceRow[]): ConformanceRow[] => rows.map(row => ({ ...row, createdAt: new Date(row.createdAt) }));

/** The rows of the running case — a fake driver's write changes them, the next case starts over. */
let current: ConformanceRow[] = copy(ROWS);

/**
 * What the fake drivers were asked for, in order: `find:<limit>` (`find:all`
 * without a limit), `count`, `write`. Lets a case prove "one write, no read before it"
 * or "no count" the same way on every adapter.
 */
export const driverCalls: string[] = [];

/** Run one case on its own rows (`CaseOptions.rows`); `undefined` restores `ROWS`. Set by the runner only. */
export function useRows(rows: readonly ConformanceRow[] | undefined): void {
  current = copy(rows ?? ROWS);
  driverCalls.length = 0;
}

/** Plain copies, so a fake driver can never mutate the table by accident. */
export function cloneRows(): ConformanceRow[] {
  return copy(current);
}

/** A fake driver's update / delete: the case's rows from now on. */
export function writeRows(rows: readonly ConformanceRow[]): void {
  current = copy(rows);
}

/** One driver call for `driverCalls`. */
export function recordCall(kind: "find" | "count" | "write", limit?: number): void {
  driverCalls.push(kind === "find" ? `find:${limit ?? "all"}` : kind);
}
