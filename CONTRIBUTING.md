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

## Ship

Push `main` directly while the project is early. CI runs typecheck, unit tests, and format check.
