// The one place domain code gets Temporal from (ADR 0010, amendment "bundle size").
//
// Nothing here imports the polyfill at runtime, so the browser bundle only carries it as a lazy
// chunk. Whoever runs the domain installs Temporal on globalThis first:
//   - browser: src/main.tsx imports "temporal-polyfill/global" only when the engine lacks it;
//   - Worker:  src/worker/api.ts imports "temporal-polyfill/global" (a no-op if workerd has it);
//   - Vitest:  src/test-setup.ts does the same.
// The polyfill's types are used for annotations only; they match the native API.
import type { Temporal as TemporalNamespace } from "temporal-polyfill";

export type { TemporalNamespace as Temporal };

/** The global Temporal namespace. Read at call time, so it works whenever the polyfill lands. */
export function temporal(): typeof TemporalNamespace {
	const t = (globalThis as { Temporal?: typeof TemporalNamespace }).Temporal;
	if (!t) throw new Error("Temporal is not available: install temporal-polyfill/global first.");
	return t;
}
