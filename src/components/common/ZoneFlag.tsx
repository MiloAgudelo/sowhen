// Small flag for a time zone's country (ADR 0017). Images, not emoji: Windows has no flag emoji.
// Zones without a country (UTC, Etc/*) and unknown ones show a globe.
import { GlobeIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { zoneCountry } from "@/lib/zones";
import type { ZoneId } from "@/shared/types";

export function ZoneFlag({ zone, className }: { zone: ZoneId; className?: string }) {
	const cc = zoneCountry(zone);
	const [failed, setFailed] = useState<string | null>(null);
	if (!cc || failed === cc) return <GlobeIcon aria-hidden className={cn("h-[15px] w-5 shrink-0 text-muted-foreground", className)} />;
	return (
		<img
			src={`/flags/${cc}.webp`}
			alt=""
			aria-hidden
			width={20}
			height={15}
			loading="lazy"
			decoding="async"
			onError={() => setFailed(cc)}
			className={cn("h-[15px] w-5 shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.12)]", className)}
		/>
	);
}
