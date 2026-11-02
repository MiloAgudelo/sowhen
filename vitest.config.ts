import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests run in Node without the Cloudflare plugin. Time-zone logic is tested here
// across the ADR 0012 zone matrix without a browser.
export default defineConfig({
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	test: {
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		environment: "node",
		// Domain code reads globalThis.Temporal (src/domain/temporal.ts); install the polyfill as the Worker does.
		setupFiles: ["src/test-setup.ts"],
	},
});
