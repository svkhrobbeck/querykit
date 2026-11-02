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

let override: readonly ConformanceRow[] | undefined;

/** Run one case on its own rows (`CaseOptions.rows`); `undefined` restores `ROWS`. Set by the runner only. */
export function useRows(rows: readonly ConformanceRow[] | undefined): void {
  override = rows;
}

/** Plain copies, so a fake driver can never mutate the shared table. */
export function cloneRows(): ConformanceRow[] {
  return (override ?? ROWS).map(row => ({ ...row, createdAt: new Date(row.createdAt) }));
}
