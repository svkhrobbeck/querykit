/**
 * Compile-time checks (run by `tsc --noEmit`): the option objects go straight
 * into React Query, and into query-core's observer options — the shape every
 * framework adapter (Vue, Solid, Svelte) takes — with the data types coming
 * from the resource's parsers.
 */
import { createRegistry, type CursorResult, type InfiniteResult, type ListResult } from "@querykitjs/web";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { InfiniteQueryObserver, QueryObserver, type QueryClient } from "@tanstack/query-core";
import { cursorOptions, infiniteOptions, listOptions, type Fetcher } from "../src/index";

interface User {
  id: number;
  name: string;
}

type Expect<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const users = createRegistry({ adapter: "drizzle-pg" }).resource<User>("users");
declare const post: Fetcher<unknown, never>;

export function ReactList() {
  const list = useQuery(listOptions(users, { page: 1 }, post));
  const feed = useInfiniteQuery(cursorOptions(users, { limit: 20 }, post));
  const listOk: Expect<Equal<NonNullable<typeof list.data>, ListResult<User>>> = true;
  const cursorOk: Expect<Equal<NonNullable<typeof feed.data>["pages"][number]["meta"]["nextCursor"], string | null>> = true;
  return listOk && cursorOk;
}

/* The framework-neutral observers (what Vue / Solid / Svelte `useQuery` / `useInfiniteQuery` build), generics inferred as every 5.x infers them. */
export function observers(client: QueryClient) {
  const list = new QueryObserver(client, listOptions(users, { page: 1 }, post));
  const infinite = new InfiniteQueryObserver(client, infiniteOptions(users, { limit: 20 }, post));
  const cursor = new InfiniteQueryObserver(client, cursorOptions(users, { limit: 20 }, post));
  const listOk: Expect<Equal<NonNullable<ReturnType<typeof list.getCurrentResult>["data"]>, ListResult<User>>> = true;
  const infiniteOk: Expect<Equal<NonNullable<ReturnType<typeof infinite.getCurrentResult>["data"]>["pages"][number], InfiniteResult<User>>> = true;
  const cursorOk: Expect<Equal<NonNullable<ReturnType<typeof cursor.getCurrentResult>["data"]>["pages"][number], CursorResult<User>>> = true;
  return listOk && infiniteOk && cursorOk;
}
