import { bindings, defineConfig, triggers } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };

// See docs/adr/0010 (one Worker serves assets + API) and 0013 (D1 in the EU, managed with cf).
// Production: D1 "sowhen" (EU jurisdiction) on the Milo Agudelo account, served at sowhen.uk.
// Local development uses cf's local simulation with the same id (--local never touches production).
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
			DB: bindings.d1({ id: "31bc01cd-054d-424e-8469-e40f4c941629" }),
			ASSETS: bindings.assets(),
		},
		domains: ["sowhen.uk"],
		triggers: [
			// ADR 0008: daily expiry sweep.
			triggers.scheduled({ schedule: "17 3 * * *" }),
		],
	},
});
