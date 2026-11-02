// Routes (no router library; ADR 0010):
//   /                 → create event (src/pages/CreatePage)
//   /privacy          → privacy notice
//   /<slug>           → event page
//   /<slug>/admin     → admin page (secret in the URL fragment, ADR 0007)
//   /__grid           → GridDemo, dev only, when src/components/grid/GridDemo.tsx exists
import { Component, type ComponentType, type ErrorInfo, lazy, type ReactNode, Suspense, useMemo } from "react";
import { PageShell } from "@/components/layout/SiteChrome";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { parseRoute, usePathname } from "@/lib/route";
import { AdminPage } from "@/pages/AdminPage";
import { CreatePage } from "@/pages/CreatePage";
import { EventPage } from "@/pages/EventPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { PrivacyPage } from "@/pages/PrivacyPage";

// Optional dev-only grid playground. import.meta.glob returns {} when the file doesn't exist.
const gridDemoModules = import.meta.env.DEV
	? import.meta.glob<{ GridDemo?: ComponentType; default?: ComponentType }>("./components/grid/GridDemo.tsx")
	: {};
const gridDemoLoader = Object.values(gridDemoModules)[0];
const GridDemo = gridDemoLoader
	? lazy(async () => {
			const m = await gridDemoLoader();
			const C = m.GridDemo ?? m.default;
			return { default: C ?? (() => <p className="p-8">GridDemo has no export.</p>) };
		})
	: null;

export function App() {
	const pathname = usePathname();
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
			<ErrorBoundary key={pathname}>{page}</ErrorBoundary>
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
