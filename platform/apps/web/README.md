# AIX Web — Frontend Technical Foundation

**Status: technical foundation only. No approved UI design has been implemented.**
See [`docs/04_ui/README.md`](../../../docs/04_ui/README.md) for the current UI
phase and the authoritative design/measurement governance.

An npm workspace member of the `aix-platform` monorepo (`platform/`) — not an
independent project. Uses the repository's single npm lockfile
(`platform/package-lock.json`); do not run `npm install` from inside this
directory in isolation, and do not introduce a second package manager.

## Stack

Next.js (App Router, TypeScript, strict) · React · Tailwind CSS v4 ·
shadcn/ui (Radix primitives, Lucide icons) — see
[`docs/04_ui/AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md`](../../../docs/04_ui/AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md)
(`UI-03`) for exact installed versions and every implementation decision
recorded.

## Commands

Run from the workspace root (`platform/`), not from this directory:

```bash
npm run dev:web        # next dev
npm run build:web      # next build
npm run typecheck:web  # tsc --noEmit
npm run lint:web       # eslint
```

## What exists

A minimal technical smoke page (`app/page.tsx`) proving the toolchain
builds — not a real page, not the Phantom-inspired navigation, not a
dashboard. No backend API integration, no authentication, no mock data.
