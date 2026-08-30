# Contributing

## Setup

```bash
bun install
cp .env.example .env.local
```

`.neon` is created by `neon link` / `neon checkout` and must stay untracked.

## Checks

```bash
bun run typecheck
bun run test
bun run fmt
```

Live branch create/delete (throws away a smoke project):

```bash
ORIGIN_NEON_LIVE=1 NEON_API_KEY=… NEON_ORG_ID=… bun run test:e2e:live
```

## Local Function

```bash
neon dev
```

`GET http://127.0.0.1:8787/` is the health check. Neon OAuth with `client_id=neonctl` only works against that loopback callback.

## Production Function

Ship code without touching env:

```bash
neon functions deploy originneon --src src/index.ts --wait
```

Omitting `--env` keeps the Function's existing environment. `neon functions deploy --env KEY=VALUE` merges that key. On each ship, merge a new release id:

```bash
neon functions deploy originneon --src src/index.ts \
  --env "SENTRY_RELEASE=$(git rev-parse --short HEAD)" \
  --wait
```

`neon deploy` (config apply) sends the `neon.ts` `env` object as a replacement map. `process.env.X ?? ""` becomes an empty string when the shell has no secrets and blanks live values such as `SENTRY_DSN`. Do not run `neon deploy` against this project unless `--env` points at a complete production env file.

## Ship

Push `main` directly while the project is early. CI runs typecheck, unit tests, and format check.
