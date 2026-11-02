// Renders the link-preview image public/og/sowhen.png (ADR 0015): the hero photo under a violet
// overlay with the wordmark, tagline and domain, at exactly 1200×630.
//
//   node scripts/og-image.mjs [output.png]
//
// Uses Playwright's Chromium (already a dev dependency) and the self-hosted Outfit font. The page is
// served from a fake origin through page.route, so nothing is written outside the output file.
// A truecolour PNG of a photo is ~550 kB, so the screenshot is reduced to a 256-colour palette
// (median cut, light error diffusion) and written as an indexed PNG with Node's zlib: ~200 kB.
import { readFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] ?? path.join(root, "public/og/sowhen.png"));
const ORIGIN = "http://og.sowhen.local";
const W = 1200;
const H = 630;

const files = {
	"/hero.jpg": ["image/jpeg", path.join(root, "public/hero/hero.jpg")],
	"/outfit.woff2": ["font/woff2", path.join(root, "node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2")],
};

// Same geometry as MarkIcon in src/components/layout/SiteChrome.tsx.
const mark = (() => {
	const cells = [];
	for (let c = 0; c < 3; c++)
		for (let r = 0; r < 3; r++) {
			const on = (c === 1 && r > 0) || (c === 2 && r === 1);
			cells.push(`<rect x="${5.5 + c * 6}" y="${5.5 + r * 6}" width="5" height="5" rx="1.4" fill="${on ? "#fff" : "rgba(255,255,255,0.3)"}"/>`);
		}
	return `<svg viewBox="0 0 28 28" width="84" height="84"><rect x="1" y="1" width="26" height="26" rx="7" fill="#5D2F88" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"/>${cells.join("")}</svg>`;
})();

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family: Outfit; src: url(/outfit.woff2) format("woff2"); font-weight: 100 900; }
* { margin: 0; box-sizing: border-box; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body { position: relative; font-family: Outfit, sans-serif; color: #fff; background: #221034; }
.photo { position: absolute; inset: 0; background: url(/hero.jpg) center 40% / cover no-repeat; filter: grayscale(0.35) blur(1.5px); transform: scale(1.02); }
/* Violet overlay (ADR 0011, #5D2F88 family): denser on the left, where the text sits. */
.tint { position: absolute; inset: 0;
  background:
    linear-gradient(100deg, rgba(34,16,52,0.94) 0%, rgba(53,26,81,0.86) 38%, rgba(93,47,136,0.62) 70%, rgba(93,47,136,0.5) 100%),
    linear-gradient(0deg, rgba(34,16,52,0.55) 0%, rgba(34,16,52,0) 45%); }
.content { position: absolute; left: 88px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; gap: 30px; }
.brand { display: flex; align-items: center; gap: 26px; }
.word { font-size: 132px; font-weight: 650; letter-spacing: -0.035em; line-height: 1; }
.word span { color: #d9c7e9; }
.tagline { font-size: 52px; font-weight: 500; letter-spacing: -0.01em; line-height: 1.1; max-width: 760px; }
.domain { position: absolute; left: 88px; bottom: 56px; font-size: 30px; font-weight: 500; color: #ece3f4; letter-spacing: 0.01em; }
.credit { position: absolute; right: 28px; bottom: 22px; font-size: 15px; color: rgba(255,255,255,0.72); }
</style></head><body>
<div class="photo"></div><div class="tint"></div>
<div class="content">
  <div class="brand">${mark}<div class="word">so<span>when</span></div></div>
  <div class="tagline">Find a time across time zones</div>
</div>
<div class="domain">sowhen.uk</div>
<div class="credit">Photo © Kandersteg International Scout Centre / Leonor Moura</div>
</body></html>`;

const browser = await chromium.launch();
try {
	const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
	await page.route(`${ORIGIN}/**`, (route) => {
		const p = new URL(route.request().url()).pathname;
		if (p === "/") return route.fulfill({ contentType: "text/html", body: html });
		const f = files[p];
		return f ? route.fulfill({ contentType: f[0], body: readFileSync(f[1]) }) : route.fulfill({ status: 404 });
	});
	await page.goto(`${ORIGIN}/`);
	await page.evaluate(() => document.fonts.ready);
	const fontOk = await page.evaluate(() => document.fonts.check('650 132px "Outfit"'));
	if (!fontOk) throw new Error("Outfit font did not load");
	mkdirSync(path.dirname(out), { recursive: true });
	const shot = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } });
	const rgba = await decodeInBrowser(page, shot);
	writeFileSync(out, indexedPng(rgba, W, H));
	console.log(`${path.relative(root, out)}: 1200×630, ${Math.round(statSync(out).size / 1024)} kB`);
} finally {
	await browser.close();
}

/** RGBA pixels of a PNG, decoded by the browser's own canvas. */
async function decodeInBrowser(page, png) {
	const b64 = await page.evaluate(async (src) => {
		const img = new Image();
		img.src = src;
		await img.decode();
		const c = document.createElement("canvas");
		c.width = img.width;
		c.height = img.height;
		const ctx = c.getContext("2d");
		ctx.drawImage(img, 0, 0);
		const data = ctx.getImageData(0, 0, c.width, c.height).data;
		let s = "";
		for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
		return btoa(s);
	}, `data:image/png;base64,${png.toString("base64")}`);
	return new Uint8Array(Buffer.from(b64, "base64"));
}

/** Median-cut palette of up to `n` colours from RGB pixels. */
function medianCut(rgba, n) {
	const px = [];
	for (let i = 0; i < rgba.length; i += 4) px.push((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
	const ch = (c, k) => (c >> (16 - 8 * k)) & 255;
	let boxes = [px];
	while (boxes.length < n) {
		// Split the box with the widest channel range (weighted by size).
		let best = -1;
		let bestScore = 0;
		let bestK = 0;
		boxes.forEach((box, i) => {
			if (box.length < 2) return;
			for (let k = 0; k < 3; k++) {
				let lo = 255;
				let hi = 0;
				for (const c of box) {
					const v = ch(c, k);
					if (v < lo) lo = v;
					if (v > hi) hi = v;
				}
				const score = (hi - lo) * Math.sqrt(box.length);
				if (score > bestScore) [best, bestScore, bestK] = [i, score, k];
			}
		});
		if (best < 0) break;
		const box = boxes[best].sort((a, b) => ch(a, bestK) - ch(b, bestK));
		const mid = box.length >> 1;
		boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
	}
	return boxes.map((box) => {
		const sum = [0, 0, 0];
		for (const c of box) for (let k = 0; k < 3; k++) sum[k] += ch(c, k);
		return sum.map((s) => Math.round(s / box.length));
	});
}

/** An 8-bit indexed PNG, with half-strength Floyd–Steinberg diffusion to soften banding. */
function indexedPng(rgba, w, h) {
	const palette = medianCut(rgba, 256);
	const cache = new Map();
	const nearest = (r, g, b) => {
		const key = (r << 16) | (g << 8) | b;
		let idx = cache.get(key);
		if (idx !== undefined) return idx;
		let bestD = Infinity;
		palette.forEach(([pr, pg, pb], i) => {
			const d = (r - pr) ** 2 * 2 + (g - pg) ** 2 * 4 + (b - pb) ** 2 * 3;
			if (d < bestD) [bestD, idx] = [d, i];
		});
		cache.set(key, idx);
		return idx;
	};
	const err = new Float32Array(w * h * 3);
	const rows = Buffer.alloc((w + 1) * h);
	const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
	for (let y = 0; y < h; y++) {
		rows[y * (w + 1)] = 0; // filter: none
		for (let x = 0; x < w; x++) {
			const p = y * w + x;
			const rgb = [0, 1, 2].map((k) => clamp(rgba[p * 4 + k] + err[p * 3 + k]));
			const idx = nearest(rgb[0], rgb[1], rgb[2]);
			rows[y * (w + 1) + 1 + x] = idx;
			for (let k = 0; k < 3; k++) {
				const e = ((rgb[k] - palette[idx][k]) * 0.5) / 16;
				if (x + 1 < w) err[(p + 1) * 3 + k] += e * 7;
				if (y + 1 < h) {
					if (x > 0) err[(p + w - 1) * 3 + k] += e * 3;
					err[(p + w) * 3 + k] += e * 5;
					if (x + 1 < w) err[(p + w + 1) * 3 + k] += e;
				}
			}
		}
	}
	const chunk = (type, data) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(zlib.crc32(body));
		return Buffer.concat([len, body, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr.set([8, 3, 0, 0, 0], 8); // 8-bit, palette, deflate, adaptive filtering, no interlace
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("PLTE", Buffer.from(palette.flat())),
		chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}
