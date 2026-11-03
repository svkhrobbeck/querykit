/**
 * Shared list URL-state cases (`url-state-cases.ts`) on every implementation — no DOM, no network.
 *
 *   bun run test/url-state.ts
 *
 * React reads through `useListParams` in react-router's `MemoryRouter`; its setters are checked
 * through `useListParamsBase` with a recording `setSearchParams` — server rendering runs no
 * effects, so react-router cannot navigate there. `test/real-router-react.ts` runs the same setter
 * cases through react-router; Angular runs them in `test/angular.ts`.
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, useSearchParams } from "react-router";

import { createListState } from "../src/index";
import { useListParams, useListParamsBase } from "../src/react/index";
import type { UseListParamsResult } from "../src/react/index";
import { useListParams as useVueListParams } from "../src/vue/index";
import { type ListStateDriver, reference, runUrlStateCases, users, usersSchema as schema } from "./url-state-cases";
import { routerAt } from "./vue-router-harness";

function renderAt(search: string, probe: () => null) {
  renderToString(createElement(MemoryRouter, { initialEntries: [`/users?${search}`] }, createElement(probe)));
}

const react: ListStateDriver = {
  async read(search) {
    let result: UseListParamsResult | undefined;
    renderAt(search, () => {
      result = useListParams(users, { schema });
      return null;
    });
    if (!result) throw new Error("useListParams did not render");
    return { params: result.params, clamped: result.clamped };
  },
  async act(search, action) {
    let next: URLSearchParams | undefined;
    renderAt(search, () => {
      const [searchParams] = useSearchParams();
      action(useListParamsBase(users, { schema, searchParams, setSearchParams: value => (next = value) }));
      return null;
    });
    if (!next) throw new Error("the action did not call setSearchParams");
    return next.toString();
  },
};

const state = createListState(users, { schema });
const core: ListStateDriver = {
  async read(search) {
    return state.read(new URLSearchParams(search));
  },
  async act(search, action) {
    return (action(state.actions(new URLSearchParams(search))) as URLSearchParams).toString();
  },
};

const vue: ListStateDriver = {
  async read(search) {
    const harness = await routerAt(`/users?${search}`);
    const result = harness.run(() => useVueListParams(users, { schema }));
    return { params: result.params.value, clamped: result.clamped.value };
  },
  async act(search, action) {
    const harness = await routerAt(`/users?${search}`);
    const result = harness.run(() => useVueListParams(users, { schema }));
    const navigated = harness.nextNavigation();
    action(result);
    await navigated;
    return result.searchParams.value.toString();
  },
};

let failed = 0;
failed += await runUrlStateCases("reference", reference, reference);
failed += await runUrlStateCases("createListState", core, reference);
failed += await runUrlStateCases("react", react, reference);
failed += await runUrlStateCases("vue", vue, reference);

console.log(`\nweb url-state: ${failed === 0 ? "all passed" : `${failed} failed`}`);
if (failed > 0) process.exitCode = 1;
