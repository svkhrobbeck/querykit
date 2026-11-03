/**
 * A happy-dom window as the globals, for the real-router tests only: import it first, so a router
 * sees a browser when it loads. happy-dom runs history and `popstate`; it is not a real browser.
 */
import { Window } from "happy-dom";

const GLOBALS = [
  "document",
  "location",
  "history",
  "navigator",
  "Node",
  "Element",
  "HTMLElement",
  "HTMLIFrameElement",
  "Event",
  "PopStateEvent",
  "MutationObserver",
  "getComputedStyle",
];

const window = new Window({ url: "http://localhost/" });
const scope = globalThis as unknown as Record<string, unknown>;
const source = window as unknown as Record<string, unknown>;
scope.window = window;
for (const name of GLOBALS) Object.defineProperty(scope, name, { value: source[name], configurable: true, writable: true });

const WAIT_TIMEOUT_MS = 5000;
const WAIT_POLL_MS = 5;

/**
 * Waits for `isDone`: a setter does not return its navigation, and how long one takes depends on
 * the machine's load. A timeout is not an error here; the checks that follow report what is wrong.
 */
export async function until(isDone: () => boolean): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (!isDone() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, WAIT_POLL_MS));
}

let failed = 0;

export function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${!ok && extra ? ` — ${extra}` : ""}`);
  if (!ok) failed++;
}

/** Prints the summary and exits: happy-dom and the routers keep timers alive. */
export function finish(label: string, otherFailures = 0) {
  const total = failed + otherFailures;
  console.log(`\n${label}: ${total === 0 ? "all passed" : `${total} failed`}`);
  process.exit(total === 0 ? 0 : 1);
}
