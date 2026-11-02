// localStorage helpers. Everything here is a convenience, never a credential for responses
// (ADR 0005). Every access is wrapped: Safari private mode and blocked storage must never crash a page.

const PREFIX = "sowhen:";

function read(key: string): string | null {
	try {
		return window.localStorage.getItem(PREFIX + key);
	} catch {
		return null;
	}
}

function write(key: string, value: string | null) {
	try {
		if (value === null) window.localStorage.removeItem(PREFIX + key);
		else window.localStorage.setItem(PREFIX + key, value);
	} catch {
		// storage unavailable: ignore
	}
}

/** The name this browser used for an event, to pre-fill the name field. */
export const rememberedName = {
	get: (slug: string) => read(`name:${slug}`),
	set: (slug: string, name: string | null) => write(`name:${slug}`, name),
};

/** The admin secret for an event, kept so the same browser recognises its creator (ADR 0007). */
export const adminSecret = {
	get: (slug: string) => read(`admin:${slug}`),
	set: (slug: string, secret: string | null) => write(`admin:${slug}`, secret),
};

/** The viewer-zone override. null means "use the browser's zone". */
export const viewerZonePref = {
	get: () => read("viewer-zone"),
	set: (zone: string | null) => write("viewer-zone", zone),
};

/** Whether the grid collapses the viewer's night hours. */
export const hideNightHoursPref = {
	get: () => read("hide-night") === "1",
	set: (on: boolean) => write("hide-night", on ? "1" : null),
};
