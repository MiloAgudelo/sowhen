// Routes (no router library; ADR 0010):
//   /                 → create event (src/pages/CreatePage)
//   /privacy          → privacy notice
//   /<slug>           → event page
//   /<slug>/admin     → admin page (secret in the URL fragment, ADR 0007)
//   /__grid           → GridDemo, dev only, when src/components/grid/GridDemo.tsx exists
import { Component, type ComponentType, type ErrorInfo, lazy, type ReactNode, Suspense, useDeferredValue, useMemo } from "react";
import { PageShell } from "@/components/layout/SiteChrome";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { parseRoute, usePathname } from "@/lib/route";
import { NotFoundPage } from "@/pages/NotFoundPage";

// Each page is its own chunk (ADR 0010, amendment "bundle size"). NotFoundPage is tiny and stays in
// the entry chunk. import() is cached, so preloading and lazy() share one request.
const pageLoaders = {
	create: reloadOnChunkError(() => import("@/pages/CreatePage").then((m) => ({ default: m.CreatePage }))),
	privacy: reloadOnChunkError(() => import("@/pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage }))),
	event: reloadOnChunkError(() => import("@/pages/EventPage").then((m) => ({ default: m.EventPage }))),
	admin: reloadOnChunkError(() => import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage }))),
};

/**
 * A page chunk can fail to load when a deploy replaced it while this tab was open (the old file names
 * are gone) or on a flaky connection. Browsers cache a failed import(), so retrying in place doesn't
 * help: reload the page once to pick up the current index.html. A timestamp in sessionStorage stops a
 * reload loop; a second failure within 30 s falls through to the error boundary. If the page is already
 * navigating away, the browser cancelled the import itself: do nothing, or we'd hijack the navigation.
 */
let leavingPage = false;
if (typeof window !== "undefined") {
	window.addEventListener("beforeunload", () => {
		leavingPage = true;
	});
	window.addEventListener("pageshow", () => {
		leavingPage = false;
	});
}

function reloadOnChunkError<T>(load: () => Promise<T>): () => Promise<T> {
	const key = "sowhen:chunk-reload";
	return () =>
		load().catch((error: unknown) => {
			if (leavingPage) return new Promise<T>(() => {});
			let last = 0;
			try {
				last = Number(sessionStorage.getItem(key) ?? 0);
			} catch {
				throw error;
			}
			if (Date.now() - last < 30_000) throw error;
			try {
				sessionStorage.setItem(key, String(Date.now()));
			} catch {
				throw error;
			}
			location.reload();
			return new Promise<T>(() => {});
		});
}

const CreatePage = lazy(pageLoaders.create);
const PrivacyPage = lazy(pageLoaders.privacy);
const EventPage = lazy(pageLoaders.event);
const AdminPage = lazy(pageLoaders.admin);

/** Starts fetching the current route's page chunk early (main.tsx calls it before loading Temporal). */
export function preloadPage(pathname: string): void {
	const name = parseRoute(pathname).name;
	if (name in pageLoaders) void pageLoaders[name as keyof typeof pageLoaders]().catch(() => {});
}

/** While a page chunk loads: the same header and footer every page has, with an empty main. No spinner. */
function PageFallback() {
	return <PageShell>{null}</PageShell>;
}

// Optional dev-only grid playground. import.meta.glob returns {} when the file doesn't exist.
const gridDemoModules = import.meta.env.DEV
	? import.meta.glob<{ GridDemo?: ComponentType; default?: ComponentType }>("./components/grid/GridDemo.tsx")
	: {};
const gridDemoLoader = Object.values(gridDemoModules)[0];
const GridDemo = import.meta.env.DEV && gridDemoLoader
	? lazy(async () => {
			const m = await gridDemoLoader();
			const C = m.GridDemo ?? m.default;
			return { default: C ?? (() => <p className="p-8">GridDemo has no export.</p>) };
		})
	: null;

export function App() {
	// Deferred so that on client-side navigation the current page stays up while the next page's
	// chunk loads, instead of flashing the Suspense fallback.
	const pathname = useDeferredValue(usePathname());
	const route = useMemo(() => parseRoute(pathname), [pathname]);

	let page: ReactNode;
	switch (route.name) {
		case "create":
			page = <CreatePage />;
			break;
		case "privacy":
			page = <PrivacyPage />;
			break;
		case "event":
			page = <EventPage key={route.slug} slug={route.slug} />;
			break;
		case "admin":
			page = <AdminPage key={route.slug} slug={route.slug} />;
			break;
		case "gridDemo":
			page = GridDemo ? (
				<Suspense fallback={null}>
					<GridDemo />
				</Suspense>
			) : (
				<NotFoundPage />
			);
			break;
		default:
			page = <NotFoundPage />;
	}

	return (
		<TooltipProvider>
			<a
				href="#main"
				className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
			>
				Skip to content
			</a>
			<ErrorBoundary key={pathname}>
				<Suspense fallback={<PageFallback />}>{page}</Suspense>
			</ErrorBoundary>
			<Toaster />
		</TooltipProvider>
	);
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
	state = { error: null as Error | null };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error(error, info.componentStack);
	}
	render() {
		if (!this.state.error) return this.props.children;
		return (
			<PageShell>
				<div className="grid max-w-lg gap-3 pt-10">
					<h1 className="text-2xl font-semibold">Something went wrong</h1>
					<p className="text-muted-foreground">Reloading the page usually helps.</p>
					<Button className="w-fit" onClick={() => window.location.reload()}>
						Reload
					</Button>
				</div>
			</PageShell>
		);
	}
}
