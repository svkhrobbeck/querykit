/**
 * `useListParams` on vue-router's `createWebHistory` under happy-dom: a setter changes
 * `location.search`, the refs follow, Back returns. `test/vue.ts` keeps the memory-history cases.
 *
 *   bun run test/real-router-vue.ts
 */
import { check, finish, until } from "./dom-env";
import { version as vueVersion } from "vue";
import { createWebHistory } from "vue-router";

import { useListParams } from "../src/vue/index";
import { users, usersSchema as schema } from "./url-state-cases";
import { routerAt } from "./vue-router-harness";

console.log(`vue ${vueVersion}`);

const query = () => new URLSearchParams(location.search);

async function listAt(url: string) {
  history.replaceState(null, "", url);
  const harness = await routerAt(url, undefined, createWebHistory());
  const list = harness.run(() => useListParams(users, { schema }));
  /** Runs `act` and waits until `location.search` moved and the refs follow it. */
  const navigate = async (act: () => void) => {
    const before = location.search;
    act();
    await until(() => location.search !== before && query().toString() === list.searchParams.value.toString());
  };
  return { list, navigate };
}

{
  const { list, navigate } = await listAt("/users?status=active&page=2");
  check("the composable reads the web history URL", list.params.value.page === 2 && location.pathname === "/users", location.href);

  await navigate(() => list.setPage(3));
  check("setPage(3) → location.search changes, other params kept", query().get("page") === "3" && query().get("status") === "active", location.search);
  check("…path kept", location.pathname === "/users", location.pathname);
  check("…params.value.page = 3", list.params.value.page === 3, String(list.params.value.page));

  await navigate(() => list.setSort([{ key: "name", direction: "desc" }]));
  check("setSort → no page in location.search", !query().has("page") && query().get("sortType") === "-name", location.search);

  await navigate(() => history.back());
  check("Back → the previous location.search", query().get("page") === "3" && !query().has("sortType"), location.search);
  check("Back → the previous params", list.params.value.page === 3 && list.params.value.sort?.[0]?.key !== "name", JSON.stringify(list.params.value.sort));

  await navigate(() => list.setParam("status", null));
  check('setParam("status", null) clears it', !query().has("status"), location.search);
}

{
  const { list, navigate } = await listAt("/users?status=a&status=b&q=");
  check("a repeated key keeps both values", JSON.stringify(list.searchParams.value.getAll("status")) === '["a","b"]', list.searchParams.value.toString());
  await navigate(() => list.setPage(2));
  check("a navigation keeps both values in location.search", JSON.stringify(query().getAll("status")) === '["a","b"]', location.search);
  check("…and the empty value", query().get("q") === "", location.search);
}

finish("web real router (vue)");
