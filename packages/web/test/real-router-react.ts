/**
 * `useListParams` on react-router's memory router, rendered by `react-dom/client` under happy-dom:
 * every shared setter case goes through the real `useSearchParams`, and Back returns.
 *
 *   bun run test/real-router-react.ts
 */
import { check, finish, until } from "./dom-env";
import { createElement, version as reactVersion } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";

import { useListParams } from "../src/react/index";
import type { UseListParamsResult } from "../src/react/index";
import { type ListStateDriver, reference, runUrlStateCases, users, usersSchema as schema } from "./url-state-cases";

async function renderAt(search: string) {
  const current: { result?: UseListParamsResult } = {};
  function Probe() {
    current.result = useListParams(users, { schema });
    return null;
  }
  const router = createMemoryRouter([{ path: "/users", element: createElement(Probe) }], { initialEntries: [`/users?${search}`] });
  const root = createRoot(document.createElement("div"));
  root.render(createElement(RouterProvider, { router }));
  await until(() => current.result !== undefined);
  const list = () => {
    if (!current.result) throw new Error("useListParams did not render");
    return current.result;
  };
  const query = () => new URLSearchParams(router.state.location.search).toString();
  /** Runs `act` and waits until the URL moved and the hook re-rendered with it. */
  const navigate = async (act: () => unknown) => {
    const before = query();
    await act();
    await until(() => query() !== before && list().searchParams.toString() === query());
  };
  return { router, list, query, navigate, unmount: () => root.unmount() };
}

const react: ListStateDriver = {
  async read(search) {
    const { list, unmount } = await renderAt(search);
    const { params, clamped } = list();
    unmount();
    return { params, clamped };
  },
  async act(search, action) {
    const { list, query, navigate, unmount } = await renderAt(search);
    await navigate(() => action(list()));
    const next = query();
    unmount();
    return next;
  },
};

const failed = await runUrlStateCases(`react ${reactVersion} + react-router`, react, reference);

{
  const { router, list, query, navigate, unmount } = await renderAt("status=active&page=2");
  await navigate(() => list().setPage(3));
  check("setPage(3) → the router location and params follow", query() === "status=active&page=3" && list().params.page === 3, query());
  await navigate(() => router.navigate(-1));
  check("Back → the previous URL and params", query() === "status=active&page=2" && list().params.page === 2, query());
  unmount();
}

finish("web real router (react)", failed);
