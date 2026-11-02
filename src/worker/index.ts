// Worker entry: JSON API under /api/*, everything else falls through to static assets (SPA).
// The API itself lives in ./api.ts (contract: src/shared/api.ts).
import { env } from "cloudflare:workers";
import { handleApi } from "./api";
import { sweepExpired } from "./db";

export default {
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
			return handleApi(request, env.DB);
		}
		return env.ASSETS.fetch(request);
	},

	async scheduled(controller) {
		// ADR 0008: daily expiry sweep.
		const deleted = await sweepExpired(env.DB, new Date(controller.scheduledTime));
		console.log(`sowhen expiry sweep: ${deleted.events} event(s), ${deleted.responses} response(s) deleted`);
	},
} satisfies ExportedHandler;
