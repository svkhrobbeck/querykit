/**
 * The order of paged reads: `findList` and `findInfinite` end on the primary key, so equal
 * values cannot repeat or skip a row between pages. `findAll`, `findOne` and `findCursor` keep
 * the sort they always sent.
 */
import type { ConformanceCase } from "./case-types";
import { ROWS } from "./fixtures";

const PAGE_SIZE = 3;
const FIRST_ROWS = [0, 3, 6];

/**
 * A stable sort on `age` alone would keep ties in fixture order, so each direction runs on the
 * rows where that order is the wrong one.
 */
const WALKS = [
  {
    direction: "asc",
    rows: [...ROWS].reverse(),
    names: ["Carol", "Alina", "Frank", "Bob", "Eve_Ann", "Alice", "dave"],
  },
  {
    direction: "desc",
    rows: ROWS,
    names: ["dave", "Alice", "Eve_Ann", "Bob", "Frank", "Alina", "Carol"],
  },
] as const;

const pageCases: ConformanceCase[] = WALKS.flatMap(({ direction, rows, names }) => {
  const sort = [{ key: "age", direction }];
  const expectPage = (offset: number) => ({ names: names.slice(offset, offset + PAGE_SIZE), ordered: true, order: [`age:${direction}`, `id:${direction}`] });
  return FIRST_ROWS.flatMap((offset, index): ConformanceCase[] => [
    {
      name: `findList by age ${direction}, page ${index + 1}: ties end on the primary key`,
      group: "sort",
      call: { method: "findList", params: { sort, page: index + 1, perPage: PAGE_SIZE } },
      options: { rows },
      expect: expectPage(offset),
    },
    {
      name: `findInfinite by age ${direction}, offset ${offset}: ties end on the primary key`,
      group: "sort",
      call: { method: "findInfinite", params: { sort, limit: PAGE_SIZE, offset } },
      options: { rows },
      expect: expectPage(offset),
    },
  ]);
});

const NOT_A_WEB_CALL = "web sends a list, which has the tie-break";

export const LIST_ORDER_CASES: ConformanceCase[] = [
  ...pageCases,
  {
    name: "the default sort ends on the primary key too",
    group: "sort",
    call: { method: "findList", params: { page: 1, perPage: 2 } },
    expect: { order: ["createdAt:desc", "id:desc"] },
  },
  {
    name: "the direction follows the key really used: an unknown first key is not it",
    group: "sort",
    call: {
      method: "findInfinite",
      params: {
        sort: [
          { key: "nope", direction: "desc" },
          { key: "age", direction: "asc" },
        ],
        limit: 2,
        offset: 0,
      },
    },
    expect: { order: ["age:asc", "id:asc"], skipped: [{ site: "sort", key: "nope", reason: "unknown-key" }] },
  },
  {
    name: "the primary key as the last sort key is not repeated",
    group: "sort",
    call: {
      method: "findList",
      params: {
        sort: [
          { key: "age", direction: "asc" },
          { key: "id", direction: "desc" },
        ],
        page: 1,
        perPage: 3,
      },
    },
    expect: { names: ["Alina", "Carol", "Frank"], ordered: true, order: ["age:asc", "id:desc"] },
  },
  {
    name: "the primary key as the first sort key is not repeated",
    group: "sort",
    call: {
      method: "findInfinite",
      params: {
        sort: [
          { key: "id", direction: "desc" },
          { key: "age", direction: "asc" },
        ],
        limit: 2,
        offset: 0,
      },
    },
    expect: { names: ["Alina", "Frank"], ordered: true, order: ["id:desc", "age:asc"] },
  },
  {
    name: "exactly maxSortFields keys pass: the primary key is not counted, and need not be sortable",
    group: "policy",
    call: { method: "findList", params: { sort: [{ key: "age", direction: "asc" }], page: 1, perPage: 2 } },
    options: { policy: { sortable: ["age"], limits: { maxSortFields: 1 } } },
    expect: { names: ["Carol", "Alina"], ordered: true, order: ["age:asc", "id:asc"] },
  },
  {
    name: "maxSortFields + 1 keys stay limit-exceeded",
    group: "policy",
    call: {
      method: "findList",
      params: {
        sort: [
          { key: "age", direction: "asc" },
          { key: "name", direction: "asc" },
        ],
        page: 1,
        perPage: 2,
      },
    },
    options: { policy: { sortable: ["age", "name"], limits: { maxSortFields: 1 } } },
    expect: { error: { site: "sort", key: "maxSortFields", reason: "limit-exceeded" } },
  },
  {
    name: "a client still cannot sort by a primary key outside sortable",
    group: "policy",
    call: { method: "findList", params: { sort: [{ key: "id", direction: "asc" }], page: 1, perPage: 2 } },
    options: { policy: { sortable: ["age"] } },
    expect: { error: { site: "sort", key: "id", reason: "forbidden-key" } },
  },
  {
    name: "findAll keeps the sort as given",
    group: "sort",
    notBuiltByWeb: NOT_A_WEB_CALL,
    call: { method: "findAll", params: { sort: [{ key: "age", direction: "desc" }] } },
    expect: { order: ["age:desc"] },
  },
  {
    name: "findAll keeps the default sort",
    group: "sort",
    notBuiltByWeb: NOT_A_WEB_CALL,
    call: { method: "findAll", params: {} },
    expect: { order: ["createdAt:desc"] },
  },
  {
    name: "findOne keeps the sort as given",
    group: "sort",
    notBuiltByWeb: NOT_A_WEB_CALL,
    call: { method: "findOne", params: { sort: [{ key: "age", direction: "asc" }] } },
    expect: { order: ["age:asc"] },
  },
  {
    name: "findCursor keeps its own tie-break",
    group: "pagination",
    call: { method: "findCursor", params: { cursorKey: "createdAt", order: "desc", limit: 2 } },
    expect: { order: ["createdAt:desc", "id:desc"], names: ["Alina", "Frank"], ordered: true },
  },
  {
    name: "findCursor on the primary key has no second key",
    group: "pagination",
    call: { method: "findCursor", params: { limit: 2 } },
    expect: { order: ["id:asc"], names: ["Alice", "Bob"], ordered: true },
  },
];
