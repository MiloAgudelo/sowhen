import type * as React from "react";
import { HeroBand } from "@/components/layout/Hero";
import { linkProps } from "@/lib/route";
import { cn } from "@/lib/utils";

export function Wordmark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
	return (
		<a
			{...linkProps("/")}
			className={cn(
				"inline-flex items-center gap-2 rounded-md text-xl font-semibold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
				inverted ? "text-white focus-visible:ring-white/60" : "text-foreground",
				className,
			)}
		>
			<MarkIcon className="size-7" />
			<span>
				so<span className={inverted ? "text-brand-200" : "text-primary"}>when</span>
			</span>
		</a>
	);
}

/** sowhen's own mark: a little grid of slots with one painted run. Not a Jamboree or WOSM symbol. */
export function MarkIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 28 28" aria-hidden className={className}>
			<rect x="1" y="1" width="26" height="26" rx="7" fill="var(--brand-700)" />
			{[0, 1, 2].map((c) =>
				[0, 1, 2].map((r) => {
					const on = (c === 1 && r > 0) || (c === 2 && r === 1);
					return (
						<rect
							key={`${c}${r}`}
							x={5.5 + c * 6}
							y={5.5 + r * 6}
							width="5"
							height="5"
							rx="1.4"
							fill={on ? "#fff" : "rgba(255,255,255,0.28)"}
						/>
					);
				}),
			)}
		</svg>
	);
}

export function SiteHeader({ children, inverted = false }: { children?: React.ReactNode; inverted?: boolean }) {
	return (
		<header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 pt-4 pb-2 sm:px-6">
			<Wordmark inverted={inverted} />
			{children}
		</header>
	);
}

export function SiteFooter() {
	return (
		<footer className="mt-auto border-t border-border/70">
			<div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-5 text-sm text-muted-foreground sm:px-6">
				<span>Not an official World Scout Jamboree tool</span>
				<span aria-hidden>·</span>
				<a
					{...linkProps("/privacy")}
					className="underline underline-offset-4 hover:text-foreground focus-visible:text-foreground"
				>
					Privacy
				</a>
				<BrushStrip className="ml-auto hidden h-3 w-24 sm:block" />
			</div>
		</footer>
	);
}

/**
 * Page frame. With `hero`, the header and the hero content sit on a full-width photo band
 * (components/layout/Hero.tsx) and the page content starts overlapping the band's bottom edge.
 */
export function PageShell({
	children,
	header,
	hero,
}: {
	children: React.ReactNode;
	header?: React.ReactNode;
	hero?: React.ReactNode;
}) {
	return (
		<>
			{hero ? (
				<HeroBand header={<SiteHeader inverted>{header}</SiteHeader>}>{hero}</HeroBand>
			) : (
				<SiteHeader>{header}</SiteHeader>
			)}
			<main
				id="main"
				className={cn("mx-auto w-full max-w-5xl flex-1 px-4 pb-12 sm:px-6", hero && "relative z-10 -mt-16 sm:-mt-24")}
			>
				{children}
			</main>
			<SiteFooter />
		</>
	);
}

/** Five short palette strokes, purely decorative. */
export function BrushStrip({ className }: { className?: string }) {
	const colors = ["--wsj-red", "--wsj-orange", "--wsj-green", "--wsj-blue", "--wsj-pink"];
	return (
		<svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden className={className}>
			{colors.map((c, i) => (
				<path
					key={c}
					d={`M${i * 20 + 2} 7 C ${i * 20 + 6} ${3 + (i % 2)}, ${i * 20 + 12} ${10 - (i % 2)}, ${i * 20 + 18} 5`}
					stroke={`var(${c})`}
					strokeWidth="3.2"
					strokeLinecap="round"
					fill="none"
				/>
			))}
		</svg>
	);
}

/**
 * Soft hand-drawn accents (a loose brushstroke and a trail-sign-like arrow and dots), drawn for
 * sowhen. Purely decorative, low contrast, hidden from assistive tech.
 */
export function Doodles({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 320 120" aria-hidden className={cn("pointer-events-none", className)} fill="none">
			<path
				d="M8 86 C 48 60, 92 104, 138 78 S 226 54, 262 74"
				stroke="var(--wsj-pink)"
				strokeWidth="9"
				strokeLinecap="round"
				opacity="0.35"
			/>
			<path
				d="M20 98 C 70 84, 120 108, 170 92"
				stroke="var(--wsj-blue)"
				strokeWidth="4"
				strokeLinecap="round"
				opacity="0.35"
			/>
			{/* trail-sign-like arrow: "this way" */}
			<g stroke="var(--wsj-green)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.55">
				<path d="M236 30 L 292 30" />
				<path d="M278 18 L 294 30 L 278 42" />
			</g>
			<g fill="var(--wsj-orange)" opacity="0.6">
				<circle cx="300" cy="74" r="4" />
				<circle cx="286" cy="88" r="3" />
			</g>
		</svg>
	);
}
