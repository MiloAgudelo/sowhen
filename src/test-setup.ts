// Vitest setup: the domain reads globalThis.Temporal (src/domain/temporal.ts). Node has no native
// Temporal yet, so install the polyfill, as src/worker/api.ts does for the Worker.
import "temporal-polyfill/global";
