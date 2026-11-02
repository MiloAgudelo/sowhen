// A tiny sonner-like toaster built on Radix Toast (sonner itself would be a new dependency).
// Usage: render <Toaster /> once, then call toast("Saved") / toast.error("…") from anywhere.
import { XIcon } from "lucide-react";
import { Toast as ToastPrimitive } from "radix-ui";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type ToastKind = "default" | "success" | "error";
interface ToastItem {
	id: number;
	message: string;
	description?: string;
	kind: ToastKind;
	open: boolean;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => {
	for (const l of listeners) l();
};

function push(kind: ToastKind, message: string, description?: string) {
	items = [...items.slice(-3), { id: nextId++, message, description, kind, open: true }];
	emit();
}

function close(id: number) {
	items = items.map((t) => (t.id === id ? { ...t, open: false } : t));
	emit();
	setTimeout(() => {
		items = items.filter((t) => t.id !== id);
		emit();
	}, 300);
}

export const toast = Object.assign((message: string, description?: string) => push("default", message, description), {
	success: (message: string, description?: string) => push("success", message, description),
	error: (message: string, description?: string) => push("error", message, description),
});

function subscribe(l: () => void) {
	listeners.add(l);
	return () => listeners.delete(l);
}

export function Toaster() {
	const list = useSyncExternalStore(
		subscribe,
		() => items,
		() => items,
	);
	return (
		<ToastPrimitive.Provider swipeDirection="down" duration={4000}>
			{list.map((t) => (
				<ToastPrimitive.Root
					key={t.id}
					open={t.open}
					onOpenChange={(o) => !o && close(t.id)}
					type={t.kind === "error" ? "foreground" : "background"}
					className={cn(
						"group pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border bg-popover p-3 pr-10 text-popover-foreground shadow-lg",
						"data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
						"data-[swipe=move]:translate-y-(--radix-toast-swipe-move-y) data-[swipe=end]:animate-out",
						t.kind === "error" && "border-destructive/40",
						t.kind === "success" && "border-brand-300",
					)}
				>
					<span
						aria-hidden
						className={cn(
							"mt-1.5 size-2 shrink-0 rounded-full",
							t.kind === "error" ? "bg-destructive" : t.kind === "success" ? "bg-wsj-green" : "bg-primary",
						)}
					/>
					<div className="grid gap-0.5">
						<ToastPrimitive.Title className="text-sm font-medium">{t.message}</ToastPrimitive.Title>
						{t.description && (
							<ToastPrimitive.Description className="text-sm text-muted-foreground">
								{t.description}
							</ToastPrimitive.Description>
						)}
					</div>
					<ToastPrimitive.Close
						aria-label="Dismiss"
						className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md opacity-70 hover:bg-accent hover:opacity-100"
					>
						<XIcon className="size-4" />
					</ToastPrimitive.Close>
				</ToastPrimitive.Root>
			))}
			<ToastPrimitive.Viewport className="fixed inset-x-0 bottom-0 z-[100] mx-auto flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
		</ToastPrimitive.Provider>
	);
}
