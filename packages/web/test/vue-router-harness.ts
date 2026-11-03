/**
 * A vue-router inside a Vue app: composables run through `app.runWithContext` (so
 * `useRoute`/`useRouter` resolve) and `push` calls are counted. Memory history needs no DOM;
 * `test/real-router-vue.ts` passes `createWebHistory` under happy-dom.
 */
import { type App, createApp, createSSRApp, type Component } from "vue";
import { createMemoryHistory, createRouter, type Router, type RouterHistory } from "vue-router";

export interface RouterHarness {
  app: App;
  router: Router;
  /** History `push` calls since the harness was ready. */
  pushes: () => number;
  /** History `replace` calls since the harness was ready. */
  replaces: () => number;
  run: <R>(composable: () => R) => R;
  /** Resolves after the next navigation finishes. */
  nextNavigation: () => Promise<void>;
}

/** A router already at `path` (e.g. `/users?page=2`); `root` makes it an SSR app with that root component. */
export async function routerAt(path: string, root?: Component, history: RouterHistory = createMemoryHistory()): Promise<RouterHarness> {
  let pushes = 0;
  let replaces = 0;
  const push = history.push.bind(history);
  const replace = history.replace.bind(history);
  history.push = (...args) => {
    pushes++;
    push(...args);
  };
  history.replace = (...args) => {
    replaces++;
    replace(...args);
  };
  const router = createRouter({ history, routes: [{ path: "/:path(.*)*", component: { render: () => null } }] });
  const app = root ? createSSRApp(root) : createApp({ render: () => null });
  app.use(router);
  await router.push(path);
  await router.isReady();
  pushes = 0;
  replaces = 0;
  return {
    app,
    router,
    pushes: () => pushes,
    replaces: () => replaces,
    run: composable => app.runWithContext(composable),
    nextNavigation: () =>
      new Promise(resolve => {
        const stop = router.afterEach(() => {
          stop();
          resolve();
        });
      }),
  };
}
