# 03 Evidence — MIG-005

> Facts read from the repository and check output, not from the implementation report. Collected by the implementing session; an independent reviewer should re-collect before acceptance.

- **Collected:** 2026-09-26
- **Baseline commit:** `9bc49aa` (main = origin/main, tree clean before editing)
- **Resulting commit:** `5f78a0b`
- **Branch:** main

## Checks
| Check | Command | Status | Exit | Evidence reference |
|---|---|---|---|---|
| targeted tests | `npx vitest run tests/unit/mig005-environment.test.ts tests/unit/config.test.ts tests/unit/readiness.test.ts` | PASS (60/60) | 0 | summary only |
| full tests | `npm test` | 69 failed / 4953 passed / 269 skipped of 5291 | 1 | baseline `9bc49aa` with changes stashed: 69 failed / 4903 passed / 269 skipped of 5241. **The two failing sets are identical, test for test** (compared via vitest JSON reporter). All 69 are DB-backed integration canaries that fail loud without `TEST_DATABASE_URL`, which was unset in this session. The +50 passes are the new tests |
| typecheck | `npm run typecheck` (`tsc -b`) | PASS | 0 | summary only |
| lint | n/a — `lint:web` covers `apps/web` only; not touched | NOT_RUN | — | — |
| migrations | n/a — no migration added; head remains 070 | NOT_RUN | — | — |

## Changed files
- `platform/packages/foundation/src/environment.ts` (new)
- `platform/packages/foundation/src/config.ts`
- `platform/packages/foundation/src/index.ts`
- `platform/tests/unit/mig005-environment.test.ts` (new)
- `docs/03_implementation/tasks/MIG-005/*` (new)
- `docs/00_project_state/CURRENT_STATE.md` (§5 active task)

## Targeted evidence references
- `platform/tests/unit/mig005-environment.test.ts` covers five canonical mappings, `staging`→PRODUCTION, 26 unknown/malformed inputs → PRODUCTION (including prototype keys, whitespace variants, non-strings), case sensitivity, `loadConfig` rejection and acceptance, DEMO ≠ PRODUCTION, no granting export from the foundation, and `assertNoExchangeRuntime` refusing prohibited routes under every `ENVIRONMENT`.
