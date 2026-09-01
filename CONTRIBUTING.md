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

Preferred full deploy: keep a gitignored env file complete for every key in `neon.ts`, then
`neon deploy --env <file>`. That loads the file into `process.env` before evaluating `neon.ts`
and uploads those values. An unset declared key is `undefined` and `defineConfig` throws. Omit
a key from `neon.ts` if you do not want to write it. Never coerce a missing `process.env` value
to an empty string.

For a targeted env update without applying `neon.ts`:

```bash
neon functions deploy originneon --src src/index.ts \
  --env "SENTRY_RELEASE=$(git rev-parse --short HEAD)" \
  --wait
```

Omitting `--env` on `neon functions deploy` keeps the Function's existing environment.
`--env KEY=VALUE` merges that key (repeatable; not a file path).

## Ship

Push `main` directly while the project is early. CI runs typecheck, unit tests, and format check.
