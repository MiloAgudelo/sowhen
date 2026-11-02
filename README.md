# sowhen

No-account group scheduling at sowhen.uk. See [`CONTEXT.md`](CONTEXT.md) and [`docs/adr/`](docs/adr/).

## Local development

Everything runs against Cloudflare's local simulation. Use `cf`, never `wrangler`.

```sh
pnpm install
pnpm exec cf workers types                     # generates .cloudflare/types (needed by tsc)
pnpm exec cf d1 migrations apply 00000000-0000-4000-8000-000000000001 --local --persist-to .cloudflare/state
pnpm dev                                       # cf dev (Vite); prints the local URL
```

- The id `00000000-0000-4000-8000-000000000001` is the local-only placeholder on the `DB` binding in
  `cloudflare.config.ts`. `cf d1 migrations apply` only accepts an id, and the local simulation keys
  the database by the binding's name if it has one, so the binding uses an id only.
- `--persist-to .cloudflare/state` is the folder `cf dev` keeps its local data in. Re-run the
  migrations command after adding a migration. To start from an empty database, stop the dev server
  and delete `.cloudflare/state`.
- Before the first deploy, create the real database (`cf d1 create --jurisdiction eu`, ADR 0013),
  put its id on the `DB` binding instead of the placeholder, and run the migrations command again
  without `--local` and `--persist-to`. Locally you then use the new id in the command above.

Tests: `pnpm test` (Vitest) and `pnpm e2e` (Playwright).

- `pnpm e2e` runs the full matrix (ADR 0012: Chromium, Firefox, WebKit × five devices, each in a zone
  from the matrix). The fast slice:
  `pnpm e2e --grep @smoke --project=chromium-laptop --project=firefox-laptop --project=webkit-small-phone`.
- Playwright starts its own server (`e2e/server.mjs`): it deletes `.cloudflare/state-e2e`, applies the
  migrations into it, then runs `cf dev` with `SOWHEN_STATE_DIR` and `SOWHEN_PORT=5199`, which
  `vite.config.ts` passes to the Cloudflare plugin (`persistState`) and Vite (`strictPort`). `cf dev`
  itself takes neither flag. Your own `.cloudflare/state` is untouched.
- First time on a machine: `pnpm exec playwright install chromium firefox webkit`.
