// One generic page for unknown and expired events: never says which (ADR 0008).
import { PlusIcon } from "lucide-react";
import { Doodles, PageShell } from "@/components/layout/SiteChrome";
import { Button } from "@/components/ui/button";
import { linkProps, useDocumentTitle } from "@/lib/route";

export function NotFoundPage() {
	useDocumentTitle("Event not found · sowhen");
	return (
		<PageShell>
			<div className="grid max-w-lg gap-4 pt-12 sm:pt-20">
				<Doodles className="h-12 w-48" />
				<h1 className="text-3xl font-semibold tracking-tight text-balance">
					This event doesn't exist or has expired
				</h1>
				<p className="text-muted-foreground">
					Check the link for typos. Events are deleted 30 days after their last date.
				</p>
				<Button asChild size="lg" className="w-fit">
					<a {...linkProps("/")}>
						<PlusIcon /> Create an event
					</a>
				</Button>
			</div>
		</PageShell>
	);
}
