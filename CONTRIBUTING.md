# Contributing to Nimbus

Thanks for your interest! / コントリビューション歓迎です。

## Development setup / 開発環境

Requirements:

- **Node.js >= 22** (better-sqlite3 v13 requires it)
- **Claude Code** — for the default connection mode, install and log in once:
  the Agent SDK bundles the runtime, but running real sessions needs valid
  auth (`claude` in your terminal → follow the login flow), or set
  `ANTHROPIC_API_KEY`.

```bash
npm install
npm run dev        # launch the app (Vite + Electron, HMR)
```

## Checks — all must pass before a PR

```bash
npm run typecheck  # strict TypeScript, main + renderer projects
npm run lint       # ESLint (flat config)
npx prettier --check .
npm test           # vitest unit tests
```

### Real-SDK integration tests (opt-in)

```bash
RUN_SDK_SMOKE=1 npx vitest run src/main/services/sdk-roundtrip.integration.test.ts
```

These drive a real Claude Code session (roundtrip, concurrent sessions,
resume, approval flow). They need working auth and **consume your own
usage/credits**, so they are skipped by default and never run in CI.

### E2E smoke

```bash
NIMBUS_SMOKE=1 ELECTRON_ENABLE_LOGGING=1 npm run dev
# → launches the app and auto-runs one session; watch for
#   [nimbus:main] / [nimbus:renderer] event logs
```

## Project rules / 設計ルール

The product spec lives in [`NIMBUS_SPEC.md`](NIMBUS_SPEC.md). The
non-negotiables:

- **Security (§6)**: no plaintext credentials anywhere; everything persisted
  passes the sanitizer; `sandbox`/`contextIsolation` stay on; no telemetry.
- **Multi-session first (§3-5)**: every event/IPC payload/DB row carries a
  `sessionId`; no singleton "current session" APIs.
- **Typed IPC (§3-2)**: every IPC input _and_ output is zod-validated.
- **SDK isolation (§3-3)**: raw SDK types stay inside
  `src/main/services/normalize.ts` / `SessionManager.ts`.
- **Verify, don't guess (§10)**: check the installed `sdk.d.ts` before using
  an SDK API — doc examples have diverged from the real types before.
- **Testing (§9)**: each step ships with unit tests plus a fine-grained
  checklist under [`docs/testing/`](docs/testing/).

## Commit style

Conventional-ish prefixes (`feat:`, `fix:`, `docs:`, `test:`), present tense,
scoped to one concern per commit.
