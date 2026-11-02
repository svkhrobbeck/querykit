/**
 * Task 014: a `scope` value may be `{ in: [...] }` (P1), the registry's `timestamps`
 * names the createdAt / deletedAt fields (P2), and a client `with` needs the
 * repository's `relations` allow-list (P4, R21).
 */
import { ALL, type ConformanceCase } from "./case-types";

/** Red until 014 phase 2 (scope in), 3 (timestamps), 4 (relations); removed there. */
const SCOPE = { "drizzle-pg": "014 p2", "prisma-pg": "014 p2", mongoose: "014 p2" } as const;
const STAMPS = { "drizzle-pg": "014 p3", "prisma-pg": "014 p3", mongoose: "014 p3" } as const;
const WITH = { "drizzle-pg": "014 p4", "prisma-pg": "014 p4", mongoose: "014 p4" } as const;
const WEB = "a repository option, not built by web";
const AGE_25_OR_30 = { age: { in: [25, 30] } };

export const SCOPE_CASES: readonly ConformanceCase[] = [
  {
    name: "P1/A1: scope { age: { in: [25, 30] } } limits a read to those rows",
    group: "scope",
    call: { method: "findAll", params: {} },
    options: { scope: AGE_25_OR_30 },
    expect: { names: ["Alice", "Bob", "Eve_Ann"] },
    knownDifference: SCOPE,
    notBuiltByWeb: WEB,
  },
  {
    name: "P1/A1: scope in also limits deleteWhere({ all: true })",
    group: "scope",
    call: { method: "deleteWhere", params: { filter: { all: true } } },
    options: { scope: AGE_25_OR_30 },
    expect: { meta: { count: 3 }, remaining: ["Carol", "dave", "Frank", "Alina"] },
    knownDifference: SCOPE,
    notBuiltByWeb: WEB,
  },
  {
    name: "P1/A1: scope in also limits updateWhere (a row outside it is not touched)",
    group: "scope",
    call: { method: "updateWhere", params: { filter: [{ key: "name", operation: "=", value: "dave" }], patch: { name: "Zed" } } },
    options: { scope: AGE_25_OR_30 },
    expect: { meta: { count: 0 }, remaining: ALL },
    knownDifference: SCOPE,
    notBuiltByWeb: WEB,
  },
  {
    name: "P1/A2: scope { in: [] } → no rows, no error",
    group: "scope",
    call: { method: "findList", params: { page: 1, perPage: 5 } },
    options: { scope: { age: { in: [] } } },
    expect: { names: [], meta: { total_items: 0, total_pages: 0, current_page: 1, per_page: 5, has_next: false, has_prev: false } },
    knownDifference: SCOPE,
    notBuiltByWeb: WEB,
  },
  {
    name: "Must-not: an equality scope works as before",
    group: "scope",
    call: { method: "findAll", params: {} },
    options: { scope: { age: 25 } },
    expect: { names: ["Bob", "Eve_Ann"] },
    notBuiltByWeb: WEB,
  },
  {
    name: "P2/A3: timestamps.createdAt names the default sort field",
    group: "scope",
    call: { method: "findList", params: { page: 1, perPage: 7 } },
    options: { timestamps: { createdAt: "email" } },
    expect: { names: ["Frank", "Eve_Ann", "dave", "Carol", "Bob", "Alina", "Alice"], ordered: true },
    knownDifference: STAMPS,
    notBuiltByWeb: WEB,
  },
  {
    name: "P2/A3: timestamps.createdAt is in the default sortable (and createdAt no longer is)",
    group: "scope",
    call: { method: "findAll", params: { sort: [{ key: "createdAt", direction: "asc" }] } },
    options: { policy: "default", timestamps: { createdAt: "email" } },
    expect: { error: { site: "sort", key: "createdAt", reason: "forbidden-key" } },
    knownDifference: STAMPS,
    notBuiltByWeb: WEB,
  },
  {
    name: "P2/A3: timestamps.createdAt sorts under the default policy",
    group: "scope",
    call: { method: "findAll", params: { sort: [{ key: "email", direction: "asc" }] } },
    options: { policy: "default", timestamps: { createdAt: "email" } },
    expect: { names: ["Alice", "Alina", "Bob", "Carol", "dave", "Eve_Ann", "Frank"], ordered: true },
    knownDifference: STAMPS,
    notBuiltByWeb: WEB,
  },
  {
    name: "P2/A3: timestamps.deletedAt names the soft-delete field (rows with a value are hidden)",
    group: "scope",
    call: { method: "findAll", params: {} },
    options: { timestamps: { deletedAt: "age" } },
    expect: { names: ["Carol", "Alina"] },
    knownDifference: STAMPS,
    notBuiltByWeb: WEB,
  },
  {
    name: "P2/A3: …and withDeleted shows them",
    group: "scope",
    call: { method: "findAll", params: { withDeleted: true } },
    options: { timestamps: { deletedAt: "age" } },
    expect: { names: ALL },
    notBuiltByWeb: WEB,
  },
  {
    name: "P4/A4: with on a repository without relations → forbidden-key, site with, the driver is not called",
    group: "scope",
    call: { method: "findAll", params: { with: { posts: true } } },
    expect: { error: { site: "with", key: "posts", reason: "forbidden-key" }, calls: [] },
    knownDifference: WITH,
    notBuiltByWeb: WEB,
  },
  {
    name: "P4/A4: …also on findList",
    group: "scope",
    call: { method: "findList", params: { with: { posts: true } } },
    expect: { error: { site: "with", key: "posts", reason: "forbidden-key" }, calls: [] },
    knownDifference: WITH,
    notBuiltByWeb: WEB,
  },
];
