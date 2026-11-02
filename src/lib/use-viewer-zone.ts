// The viewer zone (ADR 0003): browser zone by default, overridable, remembered locally.
import { useCallback, useState } from "react";
import { viewerZonePref } from "@/lib/storage";
import { browserZone, canonicalZone, isValidZone } from "@/lib/zones";
import type { ZoneId } from "@/shared/types";

export function useViewerZone(): [ZoneId, (z: ZoneId) => void] {
	const [zone, setZoneState] = useState<ZoneId>(() => {
		const saved = viewerZonePref.get();
		// A saved zone may predate ADR 0016 or come from another browser: canonicalise it.
		return saved && isValidZone(saved) ? canonicalZone(saved) : browserZone();
	});
	const setZone = useCallback((zone: ZoneId) => {
		const z = canonicalZone(zone);
		setZoneState(z);
		viewerZonePref.set(z === browserZone() ? null : z);
	}, []);
	return [zone, setZone];
}
