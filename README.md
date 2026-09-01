# origin-neon

A [Cursor Origin](https://cursor.com/docs/origin) app that gives each pull request its own [Neon](https://neon.com) branch.

Origin PRs otherwise share production Postgres. Install the app on a native Origin repository. Opening a PR creates a child Neon branch. A stacked PR parents onto the parent PR's Neon branch, not production. Closing the last child deletes the branch. The PR comment is the console link, never a secret.

Agents and CI pull secrets themselves:

```bash
neon env pull
```

That is the same secret set `env pull` already writes for the branch. This app does not inject env into Vercel, Depot, or the Origin cloud agent.

## Behavior

| Origin event                                                       | Neon                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| `pull_request.created`, `reopened`, `published`, `head_ref.pushed` | Create or reuse `origin-{repo}-pr-{n}`                      |
| `pull_request.base_ref.updated`                                    | Keep the branch; fail the check if the stack parent changed |
| `pull_request.closed`, `merged`                                    | Delete if this PR has no open children                      |
| `installation.deleted`                                             | Revoke stored Neon tokens; delete leftover preview branches |

Branch names do not include the git ref. Neon forbids children of expiring branches, so preview branches have no TTL.

Stacked parent is inferred by paging open Origin PRs and matching `base.ref ===` another open PR's `head.ref`. If that parent has no Neon branch yet, the check is `action_required`.

## HTTP

The app is one Neon Function.

```
GET  /                         health
GET  /origin/install           redirect to Origin consent
GET  /origin/callback          verify installation receipt
POST /origin/webhook           signed Origin deliveries
GET  /oauth/neon/start         Neon OAuth (PKCE public client)
GET  /oauth/neon/callback      Neon OAuth code exchange
```

Install URL the Function builds:

```
https://cursor.com/codebase/apps/install
  ?client_id=ORIGIN_APP_ID
  &scope=repository:pull_requests:read repository:pull_requests:reviews:write repository:checks:write
  &redirect_uri=https://<function>/origin/callback
  &state=…
```

Webhook verification follows the Origin docs: SHA-256 of `webhook-id.timestamp.rawBody`, Ed25519 against `https://api.cursor.com/v1/origin/keys`, reject timestamps older than five minutes.

## Auth

Two credentials. Neither belongs in the customer's git repo.

**Origin** — this repo is an Origin app. Ed25519 app JWT, then `oit_…` installation tokens. That is how webhooks, checks, and comments work. Register the public key at [cursor.com/codebase/settings/apps](https://cursor.com/codebase/settings/apps). Apps cannot see repositories Origin mirrored in from GitHub.

**Neon** — two ways to call the Neon API:

1. **Labs.** A project-scoped API key in the Function's env (`NEON_API_KEY`, `NEON_PROJECT_ID`, `ORIGIN_REPO_ALLOWLIST`). One project, an explicit repo allowlist. No project picker.
2. **OAuth.** Authorization code + PKCE at `https://oauth2.neon.tech`, same public-client shape as the Neon CLI (`token_endpoint_auth_method: none`, S256). Scopes: `openid offline offline_access urn:neoncloud:projects:read urn:neoncloud:projects:update`. Refresh tokens are encrypted at rest.

`client_id=neonctl` only works with a loopback redirect (`http://127.0.0.1:…/oauth/neon/callback`). The deployed Function disables that path until a real OAuth client id and its exact registered redirect are set.

## Configure

```bash
cp .env.example .env.local
neon link
neon checkout <branch>
```

`.env.local` is local testing. `.env.prod` is production Function env.

```bash
neon deploy --env .env.prod
```

Ship code without replacing Function env:

```bash
neon functions deploy originneon --src src/index.ts --wait
```

Omitting `--env` keeps the Function's existing secrets. On each ship, merge a release id:

```bash
neon functions deploy originneon --src src/index.ts \
  --env "SENTRY_RELEASE=$(git rev-parse --short HEAD)" \
  --wait
```

`neon deploy --env .env.prod` evaluates `neon.ts` and uploads that env map. An unset declared key throws. Empty strings delete live keys. Do not run it unless `.env.prod` is the complete production environment.

| Variable                                           | Role                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| `APP_SECRET`                                       | Encrypts refresh tokens                                                |
| `PUBLIC_BASE_URL`                                  | Function URL, no trailing slash. Optional; handlers use request origin |
| `NEON_API_KEY` / `NEON_PROJECT_ID`                 | Labs path                                                              |
| `ORIGIN_REPO_ALLOWLIST`                            | Comma-separated Origin repository ids                                  |
| `ORIGIN_APP_ID` / `ORIGIN_PRIVATE_KEY_PEM`         | Origin app signing key                                                 |
| `ORIGIN_KEY_ID`                                    | Origin JWT key id (this app: same as `ORIGIN_APP_ID`)                  |
| `NEON_OAUTH_CLIENT_ID` / `NEON_OAUTH_REDIRECT_URI` | Partner OAuth client. Prod callback is the Function `/oauth/neon/callback` |
| `SENTRY_DSN` / `SENTRY_RELEASE`                    | Required in `.env.prod`. Empty locally disables Sentry                 |

`DATABASE_URL` is injected by Neon Functions for this app's own Postgres.

## Develop

```bash
bun install
bun run test
bun run typecheck
neon dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md).
