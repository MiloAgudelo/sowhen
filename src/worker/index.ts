// Worker entry: JSON API under /api/*, page HTML with link-preview tags (ADR 0015, ./pages.ts).
// Static files never reach the Worker (cloudflare.config.ts runWorkerFirst).
// The API itself lives in ./api.ts (contract: src/shared/api.ts).
import { env } from "cloudflare:workers";
import { handleApi } from "./api";
import { sweepExpired } from "./db";
import { servePage } from "./pages";

export default {
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
			return handleApi(request, env.DB);
		}
		return servePage(request, env.ASSETS, env.DB);
	},

	async scheduled(controller) {
		// ADR 0008: daily expiry sweep.
		const deleted = await sweepExpired(env.DB, new Date(controller.scheduledTime));
		console.log(`sowhen expiry sweep: ${deleted.events} event(s), ${deleted.responses} response(s) deleted`);
	},
} satisfies ExportedHandler;
