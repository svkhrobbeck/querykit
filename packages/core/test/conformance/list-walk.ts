/**
 * A real-database walk for the adapters' smoke tests: every row of a repeated value, once, through
 * `findList` and `findInfinite`, in the order `findCursor` gives for the same key.
 */
type Row = Record<string, unknown>;

export interface WalkableRepository {
  findList(params: unknown): Promise<{ data: Row[]; meta: { has_next: boolean } }>;
  findInfinite(params: unknown): Promise<{ data: Row[]; meta: { next_offset: number | null } }>;
  findCursor(params: unknown): Promise<{ data: Row[]; meta: { next_cursor: string | null; has_next: boolean } }>;
}

export interface WalkOptions {
  /** The sort key, holding one value on every row the filter selects. */
  key: string;
  idKey: string;
  filter: unknown;
  rows: number;
  check: (label: string, ok: boolean, extra?: string) => void;
}

const PAGE_SIZE = 20;

async function walkList(repository: WalkableRepository, sort: unknown, filter: unknown): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; ; page++) {
    const result = await repository.findList({ sort, filter, page, perPage: PAGE_SIZE });
    rows.push(...result.data);
    if (!result.meta.has_next) return rows;
  }
}

async function walkInfinite(repository: WalkableRepository, sort: unknown, filter: unknown): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset: number | null = 0; offset !== null;) {
    const result: Awaited<ReturnType<WalkableRepository["findInfinite"]>> = await repository.findInfinite({ sort, filter, limit: PAGE_SIZE, offset });
    rows.push(...result.data);
    offset = result.meta.next_offset;
  }
  return rows;
}

async function walkCursor(repository: WalkableRepository, key: string, order: string, filter: unknown): Promise<Row[]> {
  const rows: Row[] = [];
  for (let cursor: string | null | undefined; ;) {
    const result: Awaited<ReturnType<WalkableRepository["findCursor"]>> = await repository.findCursor({
      cursorKey: key,
      order,
      filter,
      limit: PAGE_SIZE,
      cursor,
    });
    rows.push(...result.data);
    cursor = result.meta.next_cursor;
    if (!result.meta.has_next) return rows;
  }
}

export async function checkListWalk(repository: WalkableRepository, { key, idKey, filter, rows, check }: WalkOptions): Promise<void> {
  const ids = (list: Row[]) => list.map(row => String(row[idKey]));
  for (const direction of ["asc", "desc"]) {
    const sort = [{ key, direction }];
    const cursor = ids(await walkCursor(repository, key, direction, filter));
    for (const [method, walked] of [
      ["findList", ids(await walkList(repository, sort, filter))],
      ["findInfinite", ids(await walkInfinite(repository, sort, filter))],
    ] as const) {
      check(
        `${method} ${direction} over ${rows} equal ${key}: every row once`,
        walked.length === rows && new Set(walked).size === rows,
        `${walked.length} rows, ${new Set(walked).size} unique`,
      );
      check(`${method} ${direction}: the same order as findCursor`, walked.join() === cursor.join());
    }
  }
}
