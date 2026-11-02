// Home-page photo band (ADR 0011). The photo (public/hero/hero.{avif,webp,jpg}) is the background of a
// full-width band under a red overlay, like the link-preview image (ADR 0015). The header and the
// intro sit on it in white; the page content overlaps its bottom edge (PageShell `hero`). The photo
// credit sits above the form where the form covers the bottom corner, and in that corner on wide screens.
// Never used on the event page.
import { type ReactNode, useState } from "react";
import { HERO_ALT, HERO_CREDIT, type HeroCredit as HeroCreditData } from "@/lib/hero";
import { cn } from "@/lib/utils";

export function HeroBand({ header, children }: { header: ReactNode; children: ReactNode }) {
	const [failed, setFailed] = useState(false);
	return (
		<div className="relative isolate overflow-hidden bg-brand-900 text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.55),0_2px_18px_rgb(0_0_0/0.45)]">
			{!failed && (
				<picture>
					<source srcSet="/hero/hero.avif" type="image/avif" />
					<source srcSet="/hero/hero.webp" type="image/webp" />
					<img
						src="/hero/hero.jpg"
						alt={HERO_ALT}
						decoding="async"
						fetchPriority="high"
						onError={() => setFailed(true)}
						className="absolute inset-0 -z-20 size-full object-cover object-[70%_60%]"
					/>
				</picture>
			)}
			{/* Light red overlay (20%) so the photo shows; the text carries its own shadow for legibility. */}
			<div aria-hidden className="absolute inset-0 -z-10 bg-brand-800/20" />
			{header}
			<div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-24 sm:px-6 sm:pt-14 sm:pb-36 lg:pt-20 lg:pb-44">
				{children}
			</div>
			<HeroCredit
				credit={HERO_CREDIT}
				className="absolute right-4 bottom-[4.5rem] sm:right-6 sm:bottom-[6.75rem] min-[75rem]:bottom-3 min-[75rem]:max-w-[calc((100vw-42rem)/2-2.5rem)] min-[75rem]:text-right"
			/>
		</div>
	);
}

export function HeroCredit({ credit, className }: { credit: HeroCreditData; className?: string }) {
	if (!credit.photographer && !credit.source) return null;
	const text = credit.line ?? [credit.photographer && `Photo: ${credit.photographer}`, credit.source].filter(Boolean).join(" · ");
	// Wrap only between "source / photographer", never inside a name. Beside the form (from 75rem = 1200px, i.e.
	// 1920px screens at 150% scaling), always two lines: source, then photographer, without the slash.
	const body = text.split(" / ").map((part, i, all) => (
		<span key={part} className="whitespace-nowrap min-[75rem]:block min-[75rem]:whitespace-normal">
			{part}
			{i < all.length - 1 && <span className="min-[75rem]:hidden"> / </span>}
		</span>
	));
	return (
		<p className={cn("m-0 text-[0.7rem] text-white/75 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]", className)}>
			{credit.url ? (
				<a href={credit.url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-white">
					{body}
				</a>
			) : (
				body
			)}
		</p>
	);
}
