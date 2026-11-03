// The per-event link-preview image (ADR 0018), drawn in the browser and uploaded with the admin
// secret. The Worker can't draw it: the free Workers plan allows ~10 ms of CPU per request.
// Same look as the static /og/sowhen.png (scripts/og-image.mjs): the hero photo under a red overlay,
// with the event title and dates instead of the tagline. Never names.
import { ADMIN_HEADER, OG_DRAWN_FOR_HEADER } from "@/shared/api";
import { formatDates, OG_IMAGE_HEIGHT as H, OG_IMAGE_MAX_BYTES, OG_IMAGE_WIDTH as W } from "@/shared/preview";
import type { EventDto } from "@/shared/types";
import { HERO_CREDIT } from "@/lib/hero";
import { zoneCity } from "@/lib/zones";

const FONT = '"Outfit Variable", Outfit, ui-sans-serif, system-ui, sans-serif';
const PAD = 88;

type Drawable = Pick<EventDto, "title" | "dates" | "creatorZone">;

function loadImage(src: string): Promise<HTMLImageElement> {
	const img = new Image();
	img.decoding = "async";
	img.src = src;
	return img.decode().then(() => img);
}

/** Words of `text` wrapped to `maxWidth`, at most `maxLines` lines, the last one ellipsised if cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): { lines: string[]; cut: boolean } {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = "";
	for (let i = 0; i < words.length; i++) {
		const word = words[i] ?? "";
		const next = line ? `${line} ${word}` : word;
		if (ctx.measureText(next).width <= maxWidth || !line) {
			line = next;
			continue;
		}
		lines.push(line);
		line = word;
		if (lines.length === maxLines) return { lines: ellipsise(ctx, lines, maxWidth), cut: true };
	}
	if (line) lines.push(line);
	// A single word wider than the line (a long URL, say) is cut too.
	const cut = lines.some((l) => ctx.measureText(l).width > maxWidth);
	return { lines: cut ? lines.map((l) => fit(ctx, l, maxWidth)) : lines, cut };
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
	if (ctx.measureText(text).width <= maxWidth) return text;
	let t = text;
	while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
	return `${t.trimEnd()}…`;
}

/** The last line gets an ellipsis (more words follow), trimmed until it fits. */
function ellipsise(ctx: CanvasRenderingContext2D, lines: string[], maxWidth: number): string[] {
	let last = lines.at(-1) ?? "";
	while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
	return [...lines.slice(0, -1), `${last.trimEnd()}…`];
}

function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
	const s = size / 28;
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(s, s);
	ctx.fillStyle = "#D6303C";
	ctx.beginPath();
	ctx.roundRect(1, 1, 26, 26, 7);
	ctx.fill();
	ctx.strokeStyle = "rgba(255,255,255,0.35)";
	ctx.lineWidth = 0.6;
	ctx.stroke();
	for (let c = 0; c < 3; c++)
		for (let r = 0; r < 3; r++) {
			const on = (c === 1 && r > 0) || (c === 2 && r === 1);
			ctx.fillStyle = on ? "#fff" : "rgba(255,255,255,0.3)";
			ctx.beginPath();
			ctx.roundRect(5.5 + c * 6, 5.5 + r * 6, 5, 5, 1.4);
			ctx.fill();
		}
	ctx.restore();
}

/** Draws the preview image for `event` as a 1200×630 JPEG. */
export async function drawOgImage(event: Drawable): Promise<Blob> {
	const [photo] = await Promise.all([
		loadImage("/hero/hero.jpg"),
		document.fonts.load(`650 80px ${FONT}`),
		document.fonts.load(`500 40px ${FONT}`),
	]);
	const canvas = document.createElement("canvas");
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No 2D canvas");

	// Photo, cover-fitted around 40% from the top (like the static image).
	const scale = Math.max(W / photo.naturalWidth, H / photo.naturalHeight);
	const pw = photo.naturalWidth * scale;
	const ph = photo.naturalHeight * scale;
	ctx.drawImage(photo, (W - pw) / 2, (H - ph) * 0.4, pw, ph);

	// Red overlay, denser on the left where the text sits.
	const side = ctx.createLinearGradient(0, 0, W, H * 0.18);
	side.addColorStop(0, "rgba(67,12,18,0.94)");
	side.addColorStop(0.42, "rgba(145,29,39,0.86)");
	side.addColorStop(0.75, "rgba(214,48,60,0.6)");
	side.addColorStop(1, "rgba(214,48,60,0.48)");
	ctx.fillStyle = side;
	ctx.fillRect(0, 0, W, H);
	const bottom = ctx.createLinearGradient(0, H, 0, H * 0.5);
	bottom.addColorStop(0, "rgba(67,12,18,0.6)");
	bottom.addColorStop(1, "rgba(67,12,18,0)");
	ctx.fillStyle = bottom;
	ctx.fillRect(0, 0, W, H);

	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = "#fff";

	// Brand, top left.
	drawMark(ctx, PAD, 64, 56);
	ctx.font = `650 44px ${FONT}`;
	ctx.fillText("so", PAD + 72, 107);
	const so = ctx.measureText("so").width;
	ctx.fillStyle = "#f6c9cd";
	ctx.fillText("when", PAD + 72 + so, 107);

	// Title: as large as fits in three lines.
	const maxWidth = W - PAD * 2;
	let size = 92;
	let wrapped = { lines: [] as string[], cut: false };
	for (; size >= 52; size -= 4) {
		ctx.font = `650 ${size}px ${FONT}`;
		wrapped = wrap(ctx, event.title, maxWidth, 3);
		if (!wrapped.cut) break;
	}
	size = Math.max(size, 52);
	const lineHeight = Math.round(size * 1.08);
	const datesSize = 40;
	const blockHeight = wrapped.lines.length * lineHeight + 28 + datesSize;
	let y = Math.max(190, (H - blockHeight) / 2 + size * 0.78 + 10);
	ctx.fillStyle = "#fff";
	ctx.font = `650 ${size}px ${FONT}`;
	ctx.shadowColor = "rgba(0,0,0,0.35)";
	ctx.shadowBlur = 18;
	for (const line of wrapped.lines) {
		ctx.fillText(line, PAD, y);
		y += lineHeight;
	}

	// Dates in the creator's zone.
	y += 28 - lineHeight + datesSize;
	const datesText = `${formatDates(event.dates)} · ${zoneCity(event.creatorZone)} time`;
	let ds = datesSize;
	do ctx.font = `500 ${ds}px ${FONT}`;
	while (ctx.measureText(datesText).width > maxWidth && (ds -= 2) >= 28);
	ctx.fillStyle = "#fbe4e6";
	ctx.fillText(fit(ctx, datesText, maxWidth), PAD, y);
	ctx.shadowBlur = 0;

	// Footer.
	ctx.font = `500 28px ${FONT}`;
	ctx.fillStyle = "#fff";
	ctx.fillText("Paint when you're free · sowhen.uk", PAD, H - 56);
	ctx.font = `400 15px ${FONT}`;
	ctx.fillStyle = "rgba(255,255,255,0.72)";
	ctx.textAlign = "right";
	ctx.fillText(`Photo ${HERO_CREDIT.line ?? ""}`.trim(), W - 28, H - 22);

	for (const quality of [0.85, 0.72, 0.6]) {
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
		if (blob && blob.size <= OG_IMAGE_MAX_BYTES) return blob;
	}
	throw new Error("Preview image too large");
}

const ogPath = (slug: string) => `/api/events/${encodeURIComponent(slug)}/og-image`;

/** Draws and uploads the event's preview image. Never throws: a failure just keeps the static image. */
export async function uploadOgImage(event: EventDto, secret: string): Promise<boolean> {
	try {
		const blob = await drawOgImage(event);
		const res = await fetch(ogPath(event.slug), {
			method: "PUT",
			headers: {
				"Content-Type": "image/jpeg",
				[ADMIN_HEADER]: secret,
				[OG_DRAWN_FOR_HEADER]: encodeURIComponent(JSON.stringify({ title: event.title, dates: event.dates })),
			},
			body: blob,
		});
		return res.ok;
	} catch (err) {
		console.warn("sowhen: couldn't make the link-preview image", err);
		return false;
	}
}

/** Uploads a preview image if the event has none or it shows an old title or dates. */
export async function ensureOgImage(event: EventDto, secret: string): Promise<void> {
	try {
		const res = await fetch(ogPath(event.slug), { method: "HEAD", cache: "no-store" });
		if (res.status !== 404) return;
	} catch {
		return;
	}
	await uploadOgImage(event, secret);
}
