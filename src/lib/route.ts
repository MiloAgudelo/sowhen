// Minimal client-side routing (no router library, ADR 0010).
import { useEffect, useSyncExternalStore } from "react";

export type Route =
	| { name: "create" }
	| { name: "privacy" }
	| { name: "gridDemo" }
	| { name: "event"; slug: string }
	| { name: "admin"; slug: string }
	| { name: "notFound" };

const SLUG_SEGMENT = /^[a-z0-9-]{1,64}$/;

export function parseRoute(pathname: string): Route {
	const path = pathname.replace(/\/+$/, "") || "/";
	if (path === "/") return { name: "create" };
	if (path === "/privacy") return { name: "privacy" };
	if (path === "/__grid") return { name: "gridDemo" };
	const parts = path.split("/").filter(Boolean);
	let slug: string;
	try {
		slug = decodeURIComponent(parts[0] ?? "").toLowerCase();
	} catch {
		return { name: "notFound" };
	}
	if (!SLUG_SEGMENT.test(slug)) return { name: "notFound" };
	if (parts.length === 1) return { name: "event", slug };
	if (parts.length === 2 && parts[1] === "admin") return { name: "admin", slug };
	return { name: "notFound" };
}

const listeners = new Set<() => void>();
function subscribe(l: () => void) {
	listeners.add(l);
	window.addEventListener("popstate", l);
	return () => {
		listeners.delete(l);
		window.removeEventListener("popstate", l);
	};
}

export function usePathname() {
	return useSyncExternalStore(
		subscribe,
		() => window.location.pathname,
		() => "/",
	);
}

export function navigate(to: string, { replace = false } = {}) {
	if (replace) window.history.replaceState(null, "", to);
	else window.history.pushState(null, "", to);
	for (const l of listeners) l();
	window.scrollTo({ top: 0 });
}

/** Props for an <a> that navigates client-side but stays a real link (middle-click, copy). */
export function linkProps(to: string) {
	return {
		href: to,
		onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
			if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
			e.preventDefault();
			navigate(to);
		},
	};
}

export function useDocumentTitle(title: string) {
	useEffect(() => {
		document.title = title;
	}, [title]);
}

export const eventPath = (slug: string) => `/${slug}`;
export const adminPath = (slug: string) => `/${slug}/admin`;
export const eventUrl = (slug: string) => `${window.location.origin}/${slug}`;
export const adminUrl = (slug: string, secret: string) => `${window.location.origin}/${slug}/admin#${secret}`;
