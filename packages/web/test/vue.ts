/**
 * `@querykitjs/web/vue` with a real vue-router on memory history — no DOM, no network.
 *
 *   bun run test/vue.ts
 *
 * Navigation (one history entry per setter), the route query ↔ search params conversion,
 * reactivity after a navigation, and server rendering. `scripts/test-matrix.mjs` runs it on
 * both ends of the peer ranges (vue 3.5.0 + vue-router 4.6.4, vue 3.5.44 + vue-router 5.4.0).
 */
import { defineComponent, h, version as vueVersion } from "vue";
import { renderToString } from "vue/server-renderer";

import { queryToSearchParams, searchParamsToQuery } from "../src/route-query";
import { useListParams } from "../src/vue/index";
import { users, usersSchema as schema } from "./url-state-cases";
import { routerAt } from "./vue-router-harness";

let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${!ok && extra ? ` — ${extra}` : ""}`);
  if (!ok) failed++;
}

const urlOf = (fullPath: string) => new URLSearchParams(fullPath.split("?")[1] ?? "");

// setSort: one push, sort in the query, page gone.
{
  const harness = await routerAt("/users?status=active&page=3");
  const result = harness.run(() => useListParams(users, { schema }));
  check(`composable ran under vue ${vueVersion}`, result.params.value.page === 3, String(result.params.value.page));
  const navigated = harness.nextNavigation();
  result.setSort([{ key: "name", direction: "desc" }]);
  await navigated;
  const query = urlOf(harness.router.currentRoute.value.fullPath);
  check("setSort → sortType in the route query", query.get("sortType") === "-name", harness.router.currentRoute.value.fullPath);
  check("setSort → page removed", !query.has("page") && query.get("status") === "active", harness.router.currentRoute.value.fullPath);
  check(
    "setSort → one new history entry (push, not replace)",
    harness.pushes() === 1 && harness.replaces() === 0,
    `${harness.pushes()} / ${harness.replaces()}`,
  );
  check("params follow the route", result.params.value.page === 1 && JSON.stringify(result.params.value.sort) === '[{"key":"name","direction":"desc"}]');
}

// Repeated keys and empty values survive the route query.
{
  const harness = await routerAt("/users?status=a&status=b&q=&flag");
  const result = harness.run(() => useListParams(users, { schema }));
  check(
    '?status=a&status=b → getAll("status") = ["a", "b"]',
    JSON.stringify(result.searchParams.value.getAll("status")) === '["a","b"]',
    result.searchParams.value.toString(),
  );
  check('?q= → get("q") === ""', result.searchParams.value.get("q") === "");
  check('?flag (null) → get("flag") === ""', result.searchParams.value.get("flag") === "");
  const navigated = harness.nextNavigation();
  result.setPage(2);
  await navigated;
  const query = urlOf(harness.router.currentRoute.value.fullPath);
  check("a navigation keeps the repeated key", JSON.stringify(query.getAll("status")) === '["a","b"]', harness.router.currentRoute.value.fullPath);
}

check(
  "query ↔ search params round trip (v4 and v5 query shapes)",
  queryToSearchParams({ a: "1", b: ["2", "3"], c: null, d: [null], e: undefined }).toString() === "a=1&b=2&b=3&c=&d=" &&
    JSON.stringify(searchParamsToQuery(new URLSearchParams("a=1&b=2&b=3&c="))) === '{"a":"1","b":["2","3"],"c":""}',
);

// Server rendering: the composable inside a component, no window or document.
{
  const Probe = defineComponent({
    setup() {
      const { params } = useListParams(users, { schema });
      return () => h("span", JSON.stringify(params.value.filter));
    },
  });
  const harness = await routerAt("/users?status=active", Probe);
  let html = "";
  let error = "";
  try {
    html = await renderToString(harness.app);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  check("no DOM in this runtime", typeof window === "undefined" && typeof document === "undefined");
  check("SSR renders without an error", error === "", error);
  check("SSR output carries the filter", html.includes("active"), html);
}

console.log(`\nweb vue: ${failed === 0 ? "all passed" : `${failed} failed`}`);
if (failed > 0) process.exitCode = 1;
