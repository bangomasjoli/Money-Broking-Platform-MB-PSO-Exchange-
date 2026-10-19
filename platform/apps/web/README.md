# AIX Web — Frontend Technical Foundation

**Status (verified 2026-10-19): UI prototype, no backend integration.** The public
homepage and authenticated Client, Staff/Operations and Admin pages exist through
UI Phase 2T; they are static and read-only with no API or authentication integration,
and visual acceptance of the authenticated UI is pending. See
[`docs/04_ui/README.md`](../../../docs/04_ui/README.md) for the phase record and the
authoritative design/measurement governance, and
[`docs/00_project_state/CURRENT_STATE.md`](../../../docs/00_project_state/CURRENT_STATE.md) §3 for current status.
Not production-ready.

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

_Historical note:_ the repository began with a minimal technical smoke page
proving the toolchain builds; that page has since been replaced by the real pages
recorded in `docs/04_ui/README.md`. There is still no backend API integration and
no authentication. Check `app/` for the pages that currently exist.
