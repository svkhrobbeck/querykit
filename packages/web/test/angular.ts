/**
 * `@querykitjs/web/angular` in a real injection context — no DOM, no network. `TestBed` needs a
 * DOM platform, so `Injector.create` + `runInInjectionContext` host it with a fake `ActivatedRoute`
 * and `Router`; Angular's own `DefaultUrlSerializer` parses each URL. `test/real-router-angular.ts` runs the real Router.
 *
 *   bun run test/angular.ts
 *
 * `scripts/test-matrix.mjs` runs it on both ends of the peer range (Angular 21 and 22).
 */
import "@angular/compiler"; // links Angular's partially compiled packages at runtime
import { Injector, runInInjectionContext, signal, VERSION } from "@angular/core";
import { ActivatedRoute, convertToParamMap, DefaultUrlSerializer, type NavigationExtras, type ParamMap, type Params, Router } from "@angular/router";
import { BehaviorSubject } from "rxjs";

import { injectListParams, injectListParamsBase, type InjectListParamsResult } from "../src/angular/index";
import { queryToSearchParams } from "../src/route-query";
import { type ListStateDriver, reference, runUrlStateCases, users, usersSchema as schema } from "./url-state-cases";

let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${!ok && extra ? ` — ${extra}` : ""}`);
  if (!ok) failed++;
}

interface Harness {
  list: InjectListParamsResult;
  route: { queryParamMap: BehaviorSubject<ParamMap> };
  navigations: { commands: unknown[]; extras: NavigationExtras }[];
  /** The query params of the last navigation. */
  lastQueryParams: () => Params;
}

function routeAt(search: string): Harness {
  const { queryParams } = new DefaultUrlSerializer().parse(`/users?${search}`);
  const route = { queryParamMap: new BehaviorSubject(convertToParamMap(queryParams)) };
  const navigations: Harness["navigations"] = [];
  const router = {
    navigate(commands: unknown[], extras: NavigationExtras) {
      navigations.push({ commands, extras });
      route.queryParamMap.next(convertToParamMap(extras.queryParams ?? {}));
      return Promise.resolve(true);
    },
  };
  const injector = Injector.create({
    providers: [
      { provide: ActivatedRoute, useValue: route },
      { provide: Router, useValue: router },
    ],
  });
  const list = runInInjectionContext(injector, () => injectListParams(users, { schema }));
  return { list, route, navigations, lastQueryParams: () => navigations.at(-1)?.extras.queryParams ?? {} };
}

const angular: ListStateDriver = {
  async read(search) {
    const { list } = routeAt(search);
    return { params: list.params(), clamped: list.clamped() };
  },
  async act(search, action) {
    const harness = routeAt(search);
    action(harness.list);
    return queryToSearchParams(harness.lastQueryParams()).toString();
  },
};

failed += await runUrlStateCases(`angular ${VERSION.full}`, angular, reference);

{
  const { list, navigations, route, lastQueryParams } = routeAt("status=active&size=20");
  list.setPage(3);
  check("setPage → navigate once", navigations.length === 1, String(navigations.length));
  check(
    "setPage → page in queryParams, others kept",
    JSON.stringify(lastQueryParams()) === '{"status":"active","size":"20","page":"3"}',
    JSON.stringify(lastQueryParams()),
  );
  check(
    "navigate is relative to the route, no replaceUrl (a history entry)",
    navigations[0]?.extras.relativeTo === (route as unknown) && navigations[0]?.extras.replaceUrl === undefined,
  );
  check("the signals follow the route", list.params().page === 3 && list.searchParams().get("page") === "3", JSON.stringify(list.params()));
  list.setSort([{ key: "name", direction: "desc" }]);
  check("setSort → page removed, sort set", !("page" in lastQueryParams()) && lastQueryParams().sortType === "-name", JSON.stringify(lastQueryParams()));
}

{
  const { list } = routeAt("page=9999&size=20");
  check("?page=9999&size=20 → clamped, page 501", list.clamped() === true && list.params().page === 501, JSON.stringify(list.params()));
}

{
  const { list, lastQueryParams } = routeAt("status=a&status=b&q=");
  check('repeated key → getAll("status") = ["a", "b"]', JSON.stringify(list.searchParams().getAll("status")) === '["a","b"]', list.searchParams().toString());
  check('empty value → get("q") === ""', list.searchParams().get("q") === "");
  list.setPage(2);
  check("a navigation keeps the repeated key", JSON.stringify(lastQueryParams().status) === '["a","b"]', JSON.stringify(lastQueryParams()));
}

{
  let message = "";
  try {
    injectListParams(users, { schema });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  check("outside an injection context → Angular's NG0203", message.includes("NG0203"), message);
}

{
  const searchParams = signal(new URLSearchParams("page=2"));
  const list = injectListParamsBase(users, { schema, searchParams, setSearchParams: next => searchParams.set(next) });
  list.setPage(4);
  check("injectListParamsBase with your own signal", list.params().page === 4 && searchParams().get("page") === "4", searchParams().toString());
}

console.log(`\nweb angular: ${failed === 0 ? "all passed" : `${failed} failed`}`);
if (failed > 0) process.exitCode = 1;
