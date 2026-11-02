// Playwright's webServer: a fresh local D1 for every run, then `cf dev` on a fixed port.
// 1. Delete .cloudflare/state-e2e (gitignored with the rest of .cloudflare/).
// 2. Apply the migrations into it with `cf d1 migrations apply --local --persist-to`.
// 3. Start `cf dev` with SOWHEN_STATE_DIR / SOWHEN_PORT, which vite.config.ts turns into the
//    Cloudflare plugin's persistState path and a strict port. Never touches the real account.
import { execFileSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = ".cloudflare/state-e2e";
const DB_ID = "00000000-0000-4000-8000-000000000001"; // local-only placeholder id on the DB binding
const PORT = process.env.SOWHEN_PORT ?? "5199";

const isWin = process.platform === "win32";
const pnpmExec = (args, opts) =>
	isWin
		? execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm", "exec", ...args], opts)
		: execFileSync("pnpm", ["exec", ...args], opts);

rmSync(path.join(root, STATE_DIR), { recursive: true, force: true });
pnpmExec(["cf", "d1", "migrations", "apply", DB_ID, "--local", "--persist-to", STATE_DIR], {
	cwd: root,
	stdio: "inherit",
});

const env = { ...process.env, SOWHEN_STATE_DIR: STATE_DIR, SOWHEN_PORT: PORT };
const child = isWin
	? spawn("cmd.exe", ["/d", "/s", "/c", "pnpm", "exec", "cf", "dev"], { cwd: root, env, stdio: "inherit" })
	: spawn("pnpm", ["exec", "cf", "dev"], { cwd: root, env, stdio: "inherit" });

const stop = () => {
	if (child.exitCode !== null) return;
	if (isWin) {
		try {
			execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
		} catch {
			// already gone
		}
	} else {
		child.kill("SIGTERM");
	}
};
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => (stop(), process.exit(0)));
process.on("exit", stop);
child.on("exit", (code) => process.exit(code ?? 0));
