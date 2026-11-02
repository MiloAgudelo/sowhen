// Worker entry: JSON API under /api/*, everything else falls through to static assets (SPA).
// Implemented in this folder (agent B) against src/shared/api.ts.
import { env } from "cloudflare:workers";

export default {
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/api/health") {
			return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
		}
		if (url.pathname.startsWith("/api/")) {
			return Response.json(
				{ error: "not_found", message: "Not implemented yet" },
				{ status: 404, headers: { "Cache-Control": "no-store" } },
			);
		}
		return env.ASSETS.fetch(request);
	},

	async scheduled() {
		// ADR 0008: expiry sweep. Implemented by agent B.
	},
} satisfies ExportedHandler;
