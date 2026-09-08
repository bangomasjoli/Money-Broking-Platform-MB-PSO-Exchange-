# AIX Full Compliance — Documentation

Labuan FSA Money Broking + PSO (Exchange application pending). This is the navigation
entry point for the documentation tree. It is not a status tracker — see the links
below for current state.

## Where current authority lives

| What you need | Where |
|---|---|
| Which document version is authoritative right now | [DOCUMENT_REGISTER.md](DOCUMENT_REGISTER.md) |
| What's currently unresolved / blocked / deferred | [OPEN_FINDINGS.md](OPEN_FINDINGS.md) |
| Why a governance decision was made | [DECISION_LOG.md](DECISION_LOG.md) |

## Where current project state lives

| What you need | Where |
|---|---|
| Project context, licence lock, accepted modules, next module — **read first** | [00_project_state/PROJECT_HANDOVER.md](00_project_state/PROJECT_HANDOVER.md) |
| Module implementation status (accepted / in progress / not started) | [00_project_state/MODULE_STATUS.md](00_project_state/MODULE_STATUS.md) |
| Copy-paste prompt to start a new session efficiently | [00_project_state/SESSION_START_PROMPT.md](00_project_state/SESSION_START_PROMPT.md) |
| Model selection + working discipline | [00_project_state/CLAUDE_CODE_USAGE_RULES.md](00_project_state/CLAUDE_CODE_USAGE_RULES.md) |

## Where module documentation lives

`02_modules/<MODULE>/` — one directory per module (`FND-01`, `IAM-01`, `IAM-02`,
`SEC-01`, `CFG-01`, `CLT-01`, `AML-01`, `KYC-01`, `WLT-01`, `LED-01`, `TRD-01`,
`E2E-01`, `DEP-01`, `WDR-01`, `REC-01`, `INC-01`, `PRT-01`), each with:

- `README.md` — module-level navigation (start here per module)
- `blueprint/v1.x/` — the blueprint pack itself, by version
- `reviews/` — blueprint review and delta-note evidence
- `acceptance/` — independent Opus acceptance/security review records
- `notes/` — implementation notes, plans, and runbooks

`02_modules/_cross_module/` holds documents that genuinely span more than one module
(currently one: the FND-01/IAM-01 v1.1→v1.2 delta note).

## Where masters live

`01_masters/` — the current authoritative master SDLC documents (00–11) plus
`01_masters/reviews/` for their review and delta-note evidence.

## Where archives live

`90_archive/masters/` — superseded master document versions.
`90_archive/modules/<MODULE>/v1.0/` — superseded v1.0 blueprint packs.
Nothing is deleted; superseded material is archived, not removed.

## Where findings and decisions live

See the table at the top of this page: [OPEN_FINDINGS.md](OPEN_FINDINGS.md) and
[DECISION_LOG.md](DECISION_LOG.md).

## Implementation handover

[03_implementation/IMP-01/README.md](03_implementation/IMP-01/README.md) — master
implementation handover pack (build order, dependency map, migration order).

## Regulatory guardrails enforced across all reviews

Money Broking + PSO approved; **Exchange pending — all exchange/order-book/matching/
market-making/principal-dealing LOCKED**. Agency back-to-back execution; disclosed
brokerage fee only; AIX inventory = zero. Third-party custody; client-money
safeguarding (full-backing). Institutional/HNWI only; retail off by default.
