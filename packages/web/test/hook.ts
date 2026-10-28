/**
 * `useListParams` with a real router — no DOM, no network.
 *
 *   bun run test/hook.ts
 *
 * Renders the hook inside `react-router`'s `MemoryRouter` with
 * `react-dom/server`, so the URL → filter / sort / page path runs exactly as in
 * an app. `scripts/test-matrix.mjs` runs it on both ends of the peer ranges
 * (react 18 + react-router 7, react 19 + react-router 8).
 */
import { createElement, version as reactVersion } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { createRegistry, defineListSchema } from "../src/index";
import { useListParams } from "../src/react/index";
import type { UseListParamsResult } from "../src/react/index";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}

interface User {
  id: number;
  name: string;
  status: string;
  createdAt: string;
}

const users = createRegistry({ adapter: "drizzle-pg" }).resource<User>("users");
const schema = defineListSchema({
  status: { operation: "=" },
  name: { operation: "%_%" },
});

let captured: UseListParamsResult | undefined;
function Probe() {
  captured = useListParams(users, { schema });
  return createElement("span", null, JSON.stringify(captured.params.filter));
}

const html = renderToString(
  createElement(MemoryRouter, { initialEntries: ["/users?status=active&name=ali&page=2&sortType=-createdAt"] }, createElement(Probe)),
);

const params = captured?.params;
const filter = JSON.stringify(params?.filter ?? []);
check(`hook ran under react ${reactVersion}`, captured !== undefined);
check("URL filter → equality condition", filter.includes('{"key":"status","operation":"=","value":"active"}'), filter);
check("URL filter → contains condition", filter.includes('{"key":"name","operation":"%_%","value":"ali"}'), filter);
check("URL page → page", params?.page === 2, String(params?.page));
check("URL sortType → sort", JSON.stringify(params?.sort) === '[{"key":"createdAt","direction":"desc"}]', JSON.stringify(params?.sort));
check("rendered output carries the filter", html.includes("active"), html.slice(0, 80));

console.log(`\nweb hook: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
