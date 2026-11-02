// Pure domain logic, shared by browser and Worker. No DOM, no Cloudflare APIs.
// Signatures are the contract; implementations live in the sibling files.

// ---- Slots (ADR 0001)
export { allSlots, generateColumns, lastSlotEnd, parseWallTime, slotToZoned, toSlotId } from "./slots";

// ---- Display in the viewer zone (ADR 0003)
export {
	columnHeaderDate,
	formatUtcOffset,
	labelSlot,
	offsetMinutes,
	offsetShifts,
	type SlotLabel,
} from "./display";

// ---- Canonical zone names (ADR 0016)
export { canonicalZone, ZONE_ALIASES } from "./zones";

// ---- Names (ADR 0005)
export { cleanDisplayName, MAX_DISPLAY_NAME, normaliseName } from "./names";

// ---- Slugs (ADR 0004)
export { RESERVED_SLUGS, SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, slugify, validateSlug } from "./slugs";

// ---- Results (ADR 0006)
export { heat, rankBestTimes, type SlotTally, tallySlots } from "./results";

// ---- Polling merge (ADR 0009)
export { mergeResponses } from "./merge";
