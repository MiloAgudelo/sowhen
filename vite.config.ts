import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

// The Playwright suite (e2e/server.mjs) runs `cf dev` against its own throwaway D1 on a fixed port.
// `cf dev` doesn't take --persist-to or --port, so those come in as env vars. Unset: normal dev.
const stateDir = process.env.SOWHEN_STATE_DIR;
const port = process.env.SOWHEN_PORT ? Number(process.env.SOWHEN_PORT) : undefined;

export default defineConfig({
	plugins: [react(), tailwindcss(), cloudflare(stateDir ? { persistState: { path: stateDir } } : {})],
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	server: port ? { port, strictPort: true, host: "127.0.0.1" } : undefined,
});
