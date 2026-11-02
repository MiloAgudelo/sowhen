// The viewer zone (ADR 0003): browser zone by default, overridable, remembered locally.
import { useCallback, useState } from "react";
import { viewerZonePref } from "@/lib/storage";
import { browserZone, isValidZone } from "@/lib/zones";
import type { ZoneId } from "@/shared/types";

export function useViewerZone(): [ZoneId, (z: ZoneId) => void] {
	const [zone, setZoneState] = useState<ZoneId>(() => {
		const saved = viewerZonePref.get();
		return saved && isValidZone(saved) ? saved : browserZone();
	});
	const setZone = useCallback((z: ZoneId) => {
		setZoneState(z);
		viewerZonePref.set(z === browserZone() ? null : z);
	}, []);
	return [zone, setZone];
}
