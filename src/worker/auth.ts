// Admin secret (ADR 0007): 32 random bytes, base64url; the server stores only its SHA-256 hex.

export function generateSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two strings (used on equal-length hex digests). */
export function constantTimeEqual(a: string, b: string): boolean {
	let diff = a.length ^ b.length;
	const n = Math.max(a.length, b.length);
	for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
	return diff === 0;
}

/** Hashes the presented secret and compares it to the stored hash. Missing secret → false. */
export async function verifySecret(presented: string | null, storedHash: string): Promise<boolean> {
	if (!presented || presented.length > 256) return false;
	return constantTimeEqual(await sha256Hex(presented), storedHash);
}
