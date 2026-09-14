# origin-neon

Cursor Origin app that creates a Neon branch for each pull request. Stacked Origin PRs get stacked Neon branches. A Neon Function receives Origin webhooks.

## Layout

```
src/index.ts                 fetch router
src/lib/plan.ts              create / reuse / close / retarget decisions
src/lib/stack.ts             parent = open PR whose head.ref === this base.ref
src/lib/branch-name.ts       origin-{repoSuffix}-pr-{number}
src/lib/handle-webhook.ts    Origin webhook I/O
src/lib/oauth.ts             PKCE public-client flow (same shape as the Neon CLI)
neon.ts                      Function slug originneon
```

## Commands

```bash
bun install
bun run typecheck
bun run test
ORIGIN_NEON_LIVE=1 NEON_API_KEY=… NEON_ORG_ID=… bun run test:e2e:live
bun run dev
bun run deploy -- --plan
bun run deploy
```

Package manager is bun. Tests are Vitest, never `bun test`.

## Rules that are easy to break

- Do not put the head ref in the Neon branch name. Retargeting a PR must not rename the branch.
- Do not set a TTL on preview branches. Neon forbids children of expiring branches, so stacking would break.
- Do not evaluate a customer `neon.ts` in the Function. v1 creates the branch; agents run `neon env pull` themselves.
- Do not put secrets in the Origin PR comment. Console link only.
- Do not use `client_id=neonctl` on the deployed Function URL. That client only accepts a loopback redirect. Localhost + `neonctl` is the CLI-shaped test path until a real OAuth client is registered.
- Map state by `(installation_id, repository_id)`. PR branches are keyed by `(repository_id, pull_number)`.
- If a stacked parent cannot be resolved, fail the Origin check with `action_required`. Never silently parent onto the default branch.
- Close and delete leaf-first. Keep a closed ancestor Neon branch while an open child exists.
- Deduplicate Origin deliveries by `webhook-id`. Verify signatures against the raw body.

## Deploy

The Function lives in a Neon project linked by `.neon` (gitignored). `neon.ts` is the source of truth. `PUBLIC_BASE_URL` is optional; handlers fall back to the request origin. Labs credentials are a **project-scoped** `NEON_API_KEY` plus `NEON_PROJECT_ID` and `ORIGIN_REPO_ALLOWLIST`.

`.env.local` is this checkout's local app (`bun run dev`, `neon env pull --file .env.local`). `.env.prod` is this checkout's Function apply file. Never symlink either file across checkouts. Sentry configuration lives only in `.env.prod`; supported local commands load `.env.local` and force Sentry off. Keep shared app keys up to date in both files. Preferred full deploy:

```bash
bun run deploy -- --plan
bun run deploy
```

`bun run deploy` upserts `SENTRY_RELEASE` to this checkout's `git rev-parse --short HEAD` in `.env.prod`, explicitly enables Sentry for config evaluation, then runs `neon deploy --profile dbx --branch main --env .env.prod`. `bun run deploy -- --plan` does the same upsert and runs `neon config plan`. The child env makes `.env.prod` win over inherited Function keys, including an empty `SENTRY_RELEASE`. `--env` does not override an already-set shell var. An unset `SENTRY_RELEASE` makes `defineConfig` throw. Do not replace the wrapper with raw `neon deploy`; without its production enablement, `neon.ts` omits Sentry. Source-only `neon functions deploy originneon --profile dbx --src src/index.ts --wait` preserves live Sentry env and is the rollback path.

Keep `.env.prod` complete for every key in `neon.ts`. Same Neon project as local, so `neon deploy`'s env pull into `.env.local` is correct; local `PUBLIC_BASE_URL` and OAuth redirect must stay on `127.0.0.1:8787` (pull only updates Neon-owned keys). An unset declared key throws. Omit a key from `neon.ts` to skip writing it. Never coerce a missing `process.env` value to an empty string. A live Function env name missing from `.env.prod` stops the apply. `neon functions deploy originneon --profile dbx --src src/index.ts --env KEY=VALUE --wait` is the manual path for a targeted update.

## Ship

Push `main` directly. No feature branch and no PR while this is early.
