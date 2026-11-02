import { CheckIcon, CopyIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		// Fallback for older browsers or blocked clipboard API.
		const ta = document.createElement("textarea");
		ta.value = text;
		ta.setAttribute("readonly", "");
		ta.style.position = "fixed";
		ta.style.opacity = "0";
		document.body.appendChild(ta);
		ta.select();
		let ok = false;
		try {
			ok = document.execCommand("copy");
		} catch {
			ok = false;
		}
		ta.remove();
		return ok;
	}
}

export function CopyButton({
	text,
	label = "Copy",
	copiedLabel = "Copied",
	className,
	variant = "outline",
	size,
}: {
	text: string;
	label?: string;
	copiedLabel?: string;
	className?: string;
	variant?: "default" | "outline" | "secondary" | "ghost";
	size?: "default" | "sm" | "lg";
}) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			type="button"
			variant={variant}
			size={size}
			className={className}
			onClick={async () => {
				if (await copyText(text)) {
					setCopied(true);
					setTimeout(() => setCopied(false), 1800);
				} else {
					toast.error("Couldn't copy", "Select the link and copy it by hand.");
				}
			}}
		>
			{copied ? <CheckIcon /> : <CopyIcon />}
			<span aria-live="polite">{copied ? copiedLabel : label}</span>
		</Button>
	);
}

export function CopyField({
	label,
	value,
	hint,
	className,
	emphasis = false,
}: {
	label: string;
	value: string;
	hint?: React.ReactNode;
	className?: string;
	emphasis?: boolean;
}) {
	const id = useId();
	return (
		<div className={cn("grid gap-2", className)}>
			<Label htmlFor={id}>{label}</Label>
			<div className="flex gap-2">
				<Input
					id={id}
					readOnly
					value={value}
					onFocus={(e) => e.currentTarget.select()}
					className={cn("font-mono text-sm", emphasis && "border-primary/60 bg-brand-50")}
				/>
				<CopyButton text={value} variant={emphasis ? "default" : "outline"} />
			</div>
			{hint && <p className="text-sm text-muted-foreground">{hint}</p>}
		</div>
	);
}
