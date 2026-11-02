import "@fontsource-variable/outfit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, preloadPage } from "./App";
import "./styles/index.css";

// Domain code reads globalThis.Temporal (src/domain/temporal.ts). Current Chromium, Firefox and
// WebKit ship it; older engines get the polyfill, loaded as a separate chunk before the first render
// (ADR 0010, amendment "bundle size"). The page chunk starts downloading in parallel.
async function start() {
	if (!("Temporal" in globalThis)) {
		preloadPage(window.location.pathname);
		// If the chunk fails to load, render anyway: the error boundary offers a reload.
		await import("temporal-polyfill/global").catch((e: unknown) => console.error(e));
	}
	createRoot(document.getElementById("root")!).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}

void start();
