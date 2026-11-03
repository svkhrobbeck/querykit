/**
 * @querykitjs/tanstack-query smoke, offline: a real `QueryClient` from
 * `@tanstack/query-core` runs the options with a fake fetcher that records
 * every payload. Sets `process.exitCode` on failure.
 */
import { createRegistry, type CursorPayload, type InfinitePayload, type ListPayload } from "@querykitjs/web";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/query-core";
import { cursorOptions, detailOptions, infiniteOptions, listOptions, type Fetcher, type RawCursor, type RawInfinite, type RawList } from "../src/index";

interface User {
  id: number;
  name: string;
}

let passed = 0;
const problems: string[] = [];
function check(label: string, ok: boolean, extra = ""): void {
  if (ok) passed++;
  else problems.push(`${label}${extra ? ` — ${extra}` : ""}`);
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const users = createRegistry({ adapter: "drizzle-pg" }).resource<User>("users");
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** A fetcher that answers from a list and records each call. */
function recorder<P, R>(answers: R[]) {
  const calls: { payload: P; signal: AbortSignal }[] = [];
  const fetcher: Fetcher<P, R> = async (payload, { signal }) => {
    calls.push({ payload, signal });
    const answer = answers[calls.length - 1];
    if (answer === undefined) throw new Error(`no answer for call ${calls.length}`);
    return answer;
  };
  return { calls, fetcher };
}

/* Acceptance 1 — list. */
{
  const { calls, fetcher } = recorder<ListPayload, RawList<User, "drizzle-pg">>([
    { data: [{ id: 1, name: "a" }], meta: { total_items: 41, total_pages: 3, current_page: 2, per_page: 20 } },
  ]);
  const options = listOptions(users, { page: 2 }, fetcher);
  check("list key = keys.list(list(input))", same(options.queryKey, users.keys.list(users.list({ page: 2 }))));
  const result = await client().fetchQuery(options);
  check(
    "list result is parseList",
    result.meta.currentPage === 2 && result.meta.totalCount === 41 && result.data[0]?.name === "a",
    JSON.stringify(result.meta),
  );
  check("list fetcher called once with a signal", calls.length === 1 && calls[0]?.signal instanceof AbortSignal);
  check("a ready payload gives the same key", same(listOptions(users, users.list({ page: 2 }), fetcher).queryKey, options.queryKey));
}

/* Acceptance 2 and 4 — infinite. */
{
  const { calls, fetcher } = recorder<InfinitePayload, RawInfinite<User, "drizzle-pg">>([
    { data: [{ id: 1, name: "a" }], meta: { limit: 10, offset: 0, count: 10, has_more: true, next_offset: 10 } },
    { data: [{ id: 2, name: "b" }], meta: { limit: 10, offset: 10, count: 1, has_more: false, next_offset: null } },
  ]);
  const options = infiniteOptions(users, { limit: 10 }, fetcher);
  check(
    "infinite key ignores offset",
    same(infiniteOptions(users, { limit: 10, offset: 0 }, fetcher).queryKey, infiniteOptions(users, { limit: 10, offset: 20 }, fetcher).queryKey),
  );
  const observer = new InfiniteQueryObserver(client(), options);
  await observer.refetch();
  const next = await observer.fetchNextPage();
  check("second page asks offset 10", calls[0]?.payload.offset === 0 && calls[1]?.payload.offset === 10, JSON.stringify(calls.map(c => c.payload.offset)));
  check("nextOffset null ends the pages", next.data?.pages.length === 2 && next.hasNextPage === false);
  observer.destroy();
}

/* Acceptance 3 — cursor, both ways. */
{
  const { calls, fetcher } = recorder<CursorPayload, RawCursor<User, "drizzle-pg">>([
    { data: [{ id: 5, name: "e" }], meta: { limit: 1, has_next: true, has_prev: true, next_cursor: "abc", prev_cursor: "xyz" } },
    { data: [{ id: 6, name: "f" }], meta: { limit: 1, has_next: false, has_prev: true, next_cursor: null, prev_cursor: "abc-prev" } },
    { data: [{ id: 4, name: "d" }], meta: { limit: 1, has_next: true, has_prev: false, next_cursor: "d-next", prev_cursor: null } },
  ]);
  const options = cursorOptions(users, { limit: 1 }, fetcher);
  check("cursor key ignores the cursor", same(cursorOptions(users, { limit: 1, cursor: "zzz" }, fetcher).queryKey, options.queryKey));
  const observer = new InfiniteQueryObserver(client(), options);
  await observer.refetch();
  check("first cursor request has no cursor", calls[0]?.payload.cursor === null, String(calls[0]?.payload.cursor));
  await observer.fetchNextPage();
  check("next page sends nextCursor", calls[1]?.payload.cursor === "abc" && calls[1]?.payload.direction === "forward", JSON.stringify(calls[1]?.payload));
  await observer.fetchPreviousPage();
  check(
    "previous page sends prevCursor backward",
    calls[2]?.payload.cursor === "xyz" && calls[2]?.payload.direction === "backward",
    JSON.stringify(calls[2]?.payload),
  );
  observer.destroy();
}

/* detail */
{
  const { calls, fetcher } = recorder<string | number, User>([{ id: 7, name: "g" }]);
  const options = detailOptions(users, 7, fetcher);
  check("detail key", same(options.queryKey, users.keys.detail(7)));
  const user = await client().fetchQuery(options);
  check("detail fetcher gets the id", user.name === "g" && calls[0]?.payload === 7);
}

for (const problem of problems) console.log(`❌ [tanstack-query] ${problem}`);
console.log(`${problems.length ? "❌" : "🎉"} [tanstack-query] ${passed} passed, ${problems.length} failed`);
if (problems.length) process.exitCode = 1;
