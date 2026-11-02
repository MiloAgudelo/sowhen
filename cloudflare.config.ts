import { bindings, defineConfig, triggers } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };

// See docs/adr/0010 (one Worker serves assets + API) and 0013 (D1 in the EU, managed with cf).
// The production D1 database is created with `cf d1 create --jurisdiction eu`; its id is added
// here at deploy time. Local development uses cf's local simulation.
export default defineConfig({
	worker: {
		name: "sowhen",
		compatibilityDate: "2026-10-06",
		entrypoint,
		assets: {
			notFoundHandling: "single-page-application",
			runWorkerFirst: ["/api/*"],
		},
		env: {
			// Bound by id only: the local simulation keys a D1 database by its name when one is set,
			// but `cf d1 migrations apply --local` only accepts an id, so a name would split them.
			// This placeholder id is local-only; replace it with the real id (from
			// `cf d1 create --jurisdiction eu`) before deploying. See README "Local development".
			DB: bindings.d1({ id: "00000000-0000-4000-8000-000000000001" }),
			ASSETS: bindings.assets(),
		},
		triggers: [
			// ADR 0008: daily expiry sweep.
			triggers.scheduled({ schedule: "17 3 * * *" }),
		],
	},
});
