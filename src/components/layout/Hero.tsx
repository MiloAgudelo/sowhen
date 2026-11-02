// Home-page photo slot (ADR 0011). Reads public/hero/hero.{avif,webp,jpg}. A violet gradient sits
// behind the image and shows on its own while the files don't exist. Never used on the event page.
import { useState } from "react";
import { HERO_ALT, HERO_CREDIT, type HeroCredit as HeroCreditData } from "@/lib/hero";
import { cn } from "@/lib/utils";
import { Doodles } from "./SiteChrome";

export function HeroPhoto({ className }: { className?: string }) {
	const [failed, setFailed] = useState(false);
	const [loaded, setLoaded] = useState(false);
	return (
		<figure className={cn("relative m-0", className)}>
			<div className="relative isolate aspect-[16/10] w-full overflow-hidden rounded-2xl bg-[radial-gradient(120%_90%_at_10%_10%,var(--brand-500)_0%,var(--brand-700)_45%,var(--brand-950)_100%)] sm:aspect-[4/5] lg:aspect-[4/5]">
				{!failed && (
					<picture>
						<source srcSet="/hero/hero.avif" type="image/avif" />
						<source srcSet="/hero/hero.webp" type="image/webp" />
						<img
							src="/hero/hero.jpg"
							alt={HERO_ALT}
							decoding="async"
							fetchPriority="high"
							onLoad={() => setLoaded(true)}
							onError={() => setFailed(true)}
							className={cn(
								"absolute inset-0 size-full object-cover transition-opacity duration-500",
								loaded ? "opacity-100" : "opacity-0",
							)}
						/>
					</picture>
				)}
				{(failed || !loaded) && <GradientArt />}
			</div>
			<HeroCredit credit={HERO_CREDIT} />
		</figure>
	);
}

/** Fallback artwork: a few rows of "slots" over the gradient, with palette strokes. */
function GradientArt() {
	return (
		<div aria-hidden className="absolute inset-0">
			<svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" className="size-full">
				{Array.from({ length: 5 }, (_, c) =>
					Array.from({ length: 9 }, (_, r) => {
						const lit = (c + r) % 4 === 0 || (c === 2 && r > 2 && r < 7) || (c === 3 && r > 3 && r < 6);
						return (
							<rect
								key={`${c}-${r}`}
								x={60 + c * 58}
								y={70 + r * 42}
								width="48"
								height="34"
								rx="8"
								fill="#fff"
								opacity={lit ? 0.5 : 0.08}
							/>
						);
					}),
				)}
			</svg>
			<Doodles className="absolute right-0 bottom-3 left-0 w-full" />
		</div>
	);
}

export function HeroCredit({ credit }: { credit: HeroCreditData }) {
	if (!credit.photographer && !credit.source) return null;
	const text = credit.line ?? [credit.photographer && `Photo: ${credit.photographer}`, credit.source].filter(Boolean).join(" · ");
	return (
		<figcaption className="mt-2 text-xs text-muted-foreground">
			{credit.url ? (
				<a href={credit.url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
					{text}
				</a>
			) : (
				text
			)}
		</figcaption>
	);
}
