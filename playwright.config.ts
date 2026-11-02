// End-to-end suite (ADR 0012): Chromium, Firefox and WebKit × five device classes, with each
// project's browser context in a different time zone from the ADR's matrix.
//
//   pnpm e2e                                        full matrix (15 projects)
//   pnpm e2e --grep @smoke --project=chromium-laptop --project=firefox-laptop --project=webkit-small-phone
//                                                   fast slice
//
// The web server (e2e/server.mjs) starts `cf dev` on port 5199 against a fresh local D1 in
// .cloudflare/state-e2e for every run. It never talks to the real Cloudflare account.
import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

const PORT = 5199;
export const BASE_URL = `http://127.0.0.1:${PORT}`;

type Engine = "chromium" | "firefox" | "webkit";
type Use = NonNullable<PlaywrightTestConfig["use"]>;

const DEVICE_CLASSES: { id: string; use: (engine: Engine) => Use }[] = [
	{ id: "small-phone", use: () => ({ ...devices["iPhone SE (3rd gen)"] }) }, // 375×667, touch
	{
		id: "large-phone",
		use: (engine) => (engine === "webkit" ? { ...devices["iPhone 15 Pro Max"] } : { ...devices["Pixel 7"] }),
	},
	{ id: "tablet", use: () => ({ ...devices["iPad Mini"] }) }, // 768×1024, touch
	{ id: "laptop", use: () => ({ viewport: { width: 1366, height: 768 }, hasTouch: false, isMobile: false }) },
	{ id: "desktop", use: () => ({ viewport: { width: 1920, height: 1080 }, hasTouch: false, isMobile: false }) },
];

// ADR 0012's zone matrix. Every project gets one as its default context zone, so ordinary tests
// run across all of them; tests about zones set their own per context.
export const ZONES = [
	"Europe/Warsaw",
	"Europe/London",
	"America/Bogota",
	"America/New_York",
	"America/Mexico_City",
	"Asia/Manila",
	"Asia/Kolkata",
	"Asia/Kathmandu",
	"Pacific/Auckland",
] as const;

const ENGINES: Engine[] = ["chromium", "firefox", "webkit"];

const projects: PlaywrightTestConfig["projects"] = [];
let z = 0;
for (const engine of ENGINES) {
	for (const dc of DEVICE_CLASSES) {
		const use: Use = { ...dc.use(engine), browserName: engine, timezoneId: ZONES[z++ % ZONES.length], locale: "en-GB" };
		// Firefox has no mobile emulation (`isMobile` throws); keep viewport, touch and scale.
		if (engine === "firefox") delete use.isMobile;
		// Keep the preset's userAgent only on its own engine.
		if (engine !== "webkit" && /iPhone|iPad/.test(String(use.userAgent))) delete use.userAgent;
		if (engine !== "chromium" && /Android/.test(String(use.userAgent))) delete use.userAgent;
		projects.push({ name: `${engine}-${dc.id}`, use });
	}
}

export default defineConfig({
	testDir: "e2e",
	testMatch: "**/*.spec.ts",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 6,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: BASE_URL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		actionTimeout: 15_000,
	},
	projects,
	webServer: {
		command: "node e2e/server.mjs",
		url: `${BASE_URL}/api/health`,
		reuseExistingServer: false,
		timeout: 180_000,
		stdout: "ignore",
		stderr: "pipe",
		env: { SOWHEN_PORT: String(PORT) },
	},
});
