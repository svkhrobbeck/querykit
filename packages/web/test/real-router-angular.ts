/**
 * `injectListParams` on the real Angular `Router` and `ActivatedRoute` under happy-dom: a setter
 * changes the URL, the signals follow, Back returns. `test/angular.ts` keeps the fake-router cases.
 *
 *   bun run test/real-router-angular.ts
 */
import { check, finish, until } from "./dom-env";
import "@angular/compiler"; // links Angular's partially compiled packages at runtime
import { Location } from "@angular/common";
import { createEnvironmentInjector, provideZonelessChangeDetection, runInInjectionContext, VERSION } from "@angular/core";
import { createApplication } from "@angular/platform-browser";
import { ActivatedRoute, provideRouter, Router } from "@angular/router";

import { injectListParams } from "../src/angular/index";
import { users, usersSchema as schema } from "./url-state-cases";

const urlParams = (url: string) => new URLSearchParams(url.split("?")[1] ?? "");

async function appAt(search: string) {
  history.replaceState(null, "", `/users?${search}`);
  const app = await createApplication({ providers: [provideZonelessChangeDetection(), provideRouter([{ path: "users", children: [] }])] });
  const router = app.injector.get(Router);
  // The app's bootstrap does this; it also starts listening to `popstate`.
  router.initialNavigation();
  await until(() => router.navigated && router.routerState.root.firstChild !== null);
  const route = router.routerState.root.firstChild;
  if (!route) throw new Error(`no activated route at ${router.url}`);
  const injector = createEnvironmentInjector([{ provide: ActivatedRoute, useValue: route }], app.injector);
  const list = runInInjectionContext(injector, () => injectListParams(users, { schema }));
  /** Runs `act` and waits until the URL moved and the signals follow it. */
  const navigate = async (act: () => void) => {
    const before = router.url;
    act();
    await until(() => router.url !== before && urlParams(router.url).toString() === list.searchParams().toString());
  };
  return { app, router, list, location: app.injector.get(Location), navigate };
}

console.log(`Angular ${VERSION.full}`);

{
  const { app, router, list, location, navigate } = await appAt("status=active&size=20");
  await navigate(() => list.setPage(3));
  const afterPage = urlParams(router.url);
  check("setPage(3) → page=3 in router.url", afterPage.get("page") === "3", router.url);
  check("…other params kept", afterPage.get("status") === "active" && afterPage.get("size") === "20", router.url);
  check("…path kept", router.url.startsWith("/users?"), router.url);
  check("…params().page = 3", list.params().page === 3, String(list.params().page));

  await navigate(() => list.setSort([{ key: "name", direction: "desc" }]));
  check("setSort → no page, sort set", !urlParams(router.url).has("page") && urlParams(router.url).get("sortType") === "-name", router.url);

  await navigate(() => location.back());
  check("Back → the previous URL", urlParams(router.url).get("page") === "3" && !urlParams(router.url).has("sortType"), router.url);
  check("Back → the previous params()", list.params().page === 3 && list.params().sort?.[0]?.key !== "name", JSON.stringify(list.params().sort));

  await navigate(() => list.reset(["status"]));
  check('reset(["status"]) keeps only status', urlParams(router.url).toString() === "status=active", router.url);
  await navigate(() => list.reset());
  check("reset() → no query, path kept", router.url === "/users", router.url);
  app.destroy();
}

{
  const { app, router, list, navigate } = await appAt("status=a&status=b&q=");
  check(
    '?status=a&status=b → searchParams().getAll("status")',
    JSON.stringify(list.searchParams().getAll("status")) === '["a","b"]',
    list.searchParams().toString(),
  );
  check('?q= → get("q") === ""', list.searchParams().get("q") === "");
  await navigate(() => list.setPage(2));
  check("a navigation keeps both values", JSON.stringify(urlParams(router.url).getAll("status")) === '["a","b"]', router.url);
  app.destroy();
}

{
  const { app, list } = await appAt("page=9999&size=20");
  check("?page=9999&size=20 → clamped(), page 501", list.clamped() === true && list.params().page === 501, JSON.stringify(list.params().page));
  app.destroy();
}

finish("web real router (angular)");
