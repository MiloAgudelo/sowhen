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
			DB: bindings.d1({ name: "sowhen" }),
			ASSETS: bindings.assets(),
		},
		triggers: [
			// ADR 0008: daily expiry sweep.
			triggers.scheduled({ schedule: "17 3 * * *" }),
		],
	},
});
