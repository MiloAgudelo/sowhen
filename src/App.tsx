// Routes (no router library; ADR 0010):
//   /                 → create event (src/pages/CreatePage)
//   /privacy          → privacy notice
//   /<slug>           → event page
//   /<slug>/admin     → admin page (secret in the URL fragment, ADR 0007)
// Pages are implemented by agent D; this file only dispatches.
export function App() {
	return (
		<main className="p-8 font-sans">
			<h1 className="text-3xl font-semibold text-primary">sowhen</h1>
			<p className="text-muted-foreground">Scaffold. Pages coming.</p>
		</main>
	);
}
