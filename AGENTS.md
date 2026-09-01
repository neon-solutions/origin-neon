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
neon dev
neon deploy --profile dbx --env .env.prod
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

`.env.local` is local development (`neon dev`, `neon env pull`). `.env.prod` is production Function env. Keep both files up to date: when a declared Function env key is added, rotated, or removed, put the production value in `.env.prod` and the local value in `.env.local`. Preferred full deploy: `neon deploy --profile dbx --env .env.prod` with every key declared in `neon.ts` present in that file. An unset declared key throws. Omit a key from `neon.ts` to skip writing it. Never coerce a missing `process.env` value to an empty string. `neon functions deploy --env KEY=VALUE` is the manual path for a targeted update.

## Ship

Push `main` directly. No feature branch and no PR while this is early.
