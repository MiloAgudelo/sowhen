import { PageShell } from "@/components/layout/SiteChrome";
import { linkProps, useDocumentTitle } from "@/lib/route";

export function PrivacyPage() {
	useDocumentTitle("Privacy · sowhen");
	return (
		<PageShell>
			<article className="grid max-w-2xl gap-6 pt-6 pb-4 leading-relaxed">
				<header className="grid gap-2">
					<h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
					<p className="text-lg text-muted-foreground">Short version: sowhen keeps as little as it can, for as short as it can.</p>
				</header>

				<Section title="What we store">
					<p>
						For each event: its title, link, dates, time window, meeting length and the time zone it was created in.
						For each response: the name you type and the times you paint. That's all. No email addresses, no
						accounts, no IP addresses in our database.
					</p>
				</Section>

				<Section title="Who can see it">
					<p>
						<strong>Anyone with the event link</strong> can see every name and every painted time, and can change or
						delete any response. Links are easy to guess, so don't put anything private in an event title or a
						name. A first name is plenty.
					</p>
					<p>Only the person with the admin link can change the event itself or delete it.</p>
				</Section>

				<Section title="How long we keep it">
					<p>
						Every event, with all its responses, is deleted automatically <strong>30 days after its last date</strong>.
						Nothing is kept after that. You can delete your own response at any time, and the creator can delete
						the whole event earlier.
					</p>
				</Section>

				<Section title="Where it's stored">
					<p>
						In the European Union: sowhen runs on Cloudflare, and the database (Cloudflare D1) is set to the EU
						jurisdiction.
					</p>
				</Section>

				<Section title="Cookies and your browser">
					<p>
						sowhen uses no cookies and no tracking. Your browser's local storage keeps a few things on your own
						device, just for convenience: the name you used for each event, the admin link for events you
						created, your preferred time zone and whether night hours are hidden. Clearing your browser data
						removes them.
					</p>
				</Section>

				<Section title="Not official">
					<p>
						sowhen is an independent tool. It isn't made or endorsed by the World Scout Jamboree or the World
						Organization of the Scout Movement.
					</p>
				</Section>

				<p>
					<a {...linkProps("/")} className="font-medium text-primary underline underline-offset-4">
						Create an event
					</a>
				</p>
			</article>
		</PageShell>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="grid gap-2">
			<h2 className="text-xl font-semibold">{title}</h2>
			{children}
		</section>
	);
}
