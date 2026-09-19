---
document_id: UI-04
title: AIX Authenticated Platform UI Architecture
version: v0.1
document_status: DRAFT
implementation_status: N/A
module: PRT-01 (design track only — implementation NOT started)
control: UI design governance — authenticated platform information architecture, route/shell/navigation model, page-classification discipline, shadcn adoption map
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: 41e76e4
---

# AIX Authenticated Platform UI Architecture

**Status: DRAFT / CONTROLLED ARCHITECTURE.** This document is **design governance
and information architecture only**. It authorizes no authenticated page,
route, shell, sidebar, dashboard, or shadcn installation. Nothing in
`platform/apps/web/**` changed to produce this document — see §18.

This document governs the three **authenticated** AIX surfaces (Client Portal,
Staff/Operations Portal, Admin/Compliance Portal). It does not reopen the
**public** homepage, which is separately closed — see `docs/04_ui/README.md`
and `UI-02` §28.17 (`PUBLIC HOMEPAGE: VISUALLY ACCEPTED / GOVERNED / CLOSED`,
accepted baseline `42aa380`).

Git is authoritative for AIX project state. This document exists because the
authenticated platform is a large, multi-surface, multi-role system — the
architecture decisions below must be Git-tracked before any authenticated
screen is coded, not discovered ad hoc per page.

---

## 1. Purpose

Establish, before any authenticated screen is built:

1. portal/surface boundaries
2. route architecture
3. shell architecture
4. navigation model
5. authenticated information hierarchy
6. density rules
7. shared component strategy
8. shadcn usage plan
9. responsive shell behavior
10. permission-aware navigation principles
11. page-status rules
12. demo/proposed-screen rules
13. visual distinction from the public website
14. implementation sequence

**Explicitly not built this turn:** dashboard, sidebar, portfolio, wallet
page, trade page, deposit page, withdrawal page, staff queue, compliance
dashboard, admin page. No route, no component, no shadcn install.

---

## 2. Evidence Base

Every classification and route claim in this document is derived from direct
inspection performed this turn, not assumption:

- `docs/04_ui/README.md`, `AIX_UI_DESIGN_FOUNDATION_v0.1.md` (`UI-01`),
  `AIX_UI_MEASUREMENT_SPEC_v0.1.md` (`UI-02`),
  `AIX_UI_FRONTEND_TECHNICAL_FOUNDATION_v0.1.md` (`UI-03`),
  `.claude/skills/aix-ui-design/SKILL.md`.
- Actual current frontend: `platform/apps/web/app/` contains only
  `layout.tsx`, `page.tsx`, `globals.css` — **no route beyond `/` exists**.
  `platform/apps/web/components/ui/` contains exactly 5 shadcn primitives:
  `button.tsx`, `navigation-menu.tsx`, `sheet.tsx`, `table.tsx`, `badge.tsx`.
  `platform/apps/web/components/site/` contains the 8 accepted public-site
  components only.
- `docs/01_masters/00_Licence_Scope_And_Feature_Lock_v1.3.md`,
  `02_Software_Requirement_Specification_v1.2.md`,
  `03_Master_Module_Index_v1.2.md`, `04_Role_And_Permission_Matrix_v1.2.md`.
  (`06_Master_System_Rules_v1.0.md` does not exist in this repository —
  confirmed by direct lookup; not fabricated, simply not present.)
- `docs/00_project_state/MODULE_STATUS.md` and
  `docs/00_project_state/PROJECT_HANDOVER.md` for implementation status —
  cross-checked against `docs/OPEN_FINDINGS.md`, because `MODULE_STATUS.md`
  contains its own explicit "STALE POINTER" admission partway through.
- **Actual backend route source** — every service under `platform/services/`
  was grepped directly for its registered HTTP routes (method + literal
  path), not inferred from documentation prose. This is the single most
  load-bearing evidence source in this document; see §3.

---

## 3. Backend Reality Snapshot (as actually built, not as assumed)

This is the critical finding that shapes every page classification in this
document. Grepping every registered route in every backend service
(`platform/services/{aml1,cfg1,clt1,fnd,iam,iam2,kyc1,sec1,wlt1}/src`) shows:

**Only two services expose any browser-callable (non-`/internal/*`,
non-`requireInternal`-guarded) route today:**

- **`iam` (IAM-01)** — authentication only: `/auth/login`, `/auth/logout`,
  `/auth/logout-all`, `/auth/mfa/*`, `/auth/password-reset/*`,
  `/auth/refresh`, `/auth/sessions`, `/auth/sessions/:sessionId/revoke`,
  `/auth/step-up*`. This is login/session/MFA — it returns
  `user_id`/`session_id`/`user_class` only. **It does not return client
  membership, role, or profile data.**
- **`wlt1` (WLT-01)** — a deliberate, independently-accepted 6-route public
  client contract (`platform/services/wlt1/src/routes/public/*.ts`,
  implementation `12cedda`, hardening `7f9fc8a`, acceptance record
  `docs/02_modules/WLT-01/acceptance/WLT-01_Public_Client_Surface_Opus_Acceptance_v1.0.md`):
  - `GET /wlt1/destinations`
  - `GET /wlt1/destinations/:destination_id`
  - `POST /wlt1/wallet-destinations`
  - `POST /wlt1/wallet-destinations/:destination_id/proof-of-control/challenges`
  - `POST /wlt1/wallet-destinations/:destination_id/proof-of-control/verify`
  - `POST /wlt1/payout-destinations`

  Gated by `WLT1_PUBLIC_SURFACE_ENABLED` (safe default `false` — routes are
  not even registered when disabled) plus a perimeter-provenance credential
  (`x-aix-perimeter-token`) — `WLT-FIND-010`, CLOSED at `af52fe8`. This gate
  gets the routes callable in a controlled environment; it is a separate
  question from **internet exposure**, which stays **PROHIBITED** while
  `FND-FIND-001` (HIGH/OPEN) is open — see `docs/OPEN_FINDINGS.md`. Nothing
  in this document treats internet exposure as resolved.

**Every other service is internal-only, with no exception:**
`aml1`, `cfg1`, `clt1`, `iam2`, `kyc1`, `sec1` register **zero** routes a
browser session could call directly. Their routes either live under an
explicit `/internal/*` path or (for `iam2`'s `/iam2/approvals/*` and
`/iam2/users/:user_id/roles`, which do *not* have an `/internal` path
prefix) are still guarded by `preHandler: requireInternal` — a
service-to-service capability-token check, not an end-user session check.
**A staff or admin login does not, by itself, grant a browser any ability
to call these routes.** `CLT-01` (client entity/membership/authorised-party
data, including the exact
`GET /internal/clt1/principals/:iam_user_id/client-memberships` capability
that would resolve "which client(s) does this logged-in user belong to")
is entirely internal-only today, despite being the single most complete,
fully-accepted module in the platform (71 routes, 44 errors, 18 tables, 83
audit event types per `MODULE_STATUS.md`).

**Practical consequence for this document's classification:**
- **Client Portal**: exactly one domain area (wallet/payout destination
  registration and proof-of-control) has a real, accepted, client-callable
  API today. Everything else — including the client's own profile, client
  context/membership resolution, and KYC/KYB status — is governed and in
  some cases fully implemented *internally*, but has **no public projection
  route yet**.
- **Staff/Operations Portal and Admin/Compliance Portal**: **no page in
  either surface can be classified A.** Every staff/admin capability that
  exists today (WLT destination approval/screening/rescreening, IAM-02
  maker-checker approvals, AML monitoring/risk-signals, KYC case review,
  SEC-01 alerts/audit-event search, CFG-01 feature-flag/kill-switch
  changes) is real and governed, but reachable only via internal
  service-to-service calls. A staff/admin browser session has no path to
  any of it without a new authenticated staff-facing API layer that does
  not exist yet. This is recorded explicitly rather than silently assumed,
  per this turn's "Critical Backend Reality Rule."

**Module implementation status** (from `MODULE_STATUS.md`/`PROJECT_HANDOVER.md`,
cross-checked against route evidence above): **FND-01, IAM-01, IAM-02, CLT-01
complete**; **SEC-01** (through Phase 5), **CFG-01** (through Phase 3B),
**AML-01** (through Phase 3E), **KYC-01** (through Phase 4B) **partial**;
**WLT-01** extensive (27 routes / 35 errors / 18 tables / 27 audit event
types, including the public client surface above) but **not go-live ready**
as a whole. **Not started at all: LED-01 (ledger/balance), TRD-01
(OTC/RFQ + MB Spot Broking Terminal), DEP-01 (deposit workflow), WDR-01
(withdrawal workflow), REC-01 (reconciliation), INC-01 (incidents), E2E-01,
and PRT-01** — the Master Module Index's own implementation-taxonomy code
for the authenticated frontend delivery itself (§4 below explains the
naming). **FND-FIND-001 (HIGH) remains OPEN — internet exposure of any
public route, including WLT-01's, remains PROHIBITED.**

---

## 4. Portal/Surface Boundaries

Per this turn's instruction, exactly three authenticated surfaces are
defined, sharing design-system primitives but **not** one navigation tree:

1. **Client Portal**
2. **Staff / Operations Portal**
3. **Admin / Compliance Portal**

**Relationship to the governed SDLC module taxonomy** (`03_Master_Module_Index_v1.2.md`
§"Portal Modules", `PRT-01`–`PRT-10`): the SDLC index describes ten
fine-grained portal modules — `PRT-01` Client Portal, `PRT-02` Staff Portal,
`PRT-03` Admin Portal, `PRT-04` Compliance Workspace, `PRT-05` Operations
Workspace, `PRT-06` Finance Workspace, `PRT-07` Support Workspace, `PRT-08`
Management Dashboard, `PRT-09` Design System, `PRT-10` UX Copy Library. The
**17-module implementation-delivery taxonomy** (`MODULE_STATUS.md`) tracks
all of this frontend delivery under a single code, **`PRT-01`, NOT
STARTED** — consistent with how other implementation modules consolidate
many SDLC sub-modules (e.g. `AML-01` implementation covers SDLC's `CMP-03`
through `CMP-21`). This document is the architecture groundwork for that
single `PRT-01` implementation-delivery track; **no implementation credit
toward `PRT-01` is claimed by this turn** — it remains NOT STARTED.

This document maps the SDLC's finer portal modules onto the three
instructed surfaces as follows, and records the mapping as a **documented
simplification**, not a rejection of the finer taxonomy — a future phase
may split Staff/Operations further once real usage volume justifies it:

| Surface (this document) | SDLC portal modules folded in |
|---|---|
| Client Portal | `PRT-01` |
| Staff / Operations Portal | `PRT-02` Staff Portal, `PRT-05` Operations Workspace, `PRT-07` Support Workspace |
| Admin / Compliance Portal | `PRT-03` Admin Portal, `PRT-04` Compliance Workspace, `PRT-06` Finance Workspace, `PRT-08` Management Dashboard |

`PRT-09` (Design System) and `PRT-10` (UX Copy Library) are cross-cutting,
not surface-specific — `PRT-09`'s subject is already `UI-01`/`UI-02`/`UI-03`
plus this document; `PRT-10` is a Fable-scoped concern (`UI-01` §16), not
started, out of scope here.

---

## 5. Page-Classification Framework

Every page named in §6–§9 carries exactly one label:

- **A — BACKED BY CURRENT IMPLEMENTATION**: a real, accepted, callable
  backend route exists that the page's core function needs (browser-callable
  for Client Portal; for Staff/Admin, see the note below).
- **B — BACKED BY GOVERNED MODULE / WORKFLOW BUT NOT YET FULLY
  IMPLEMENTED**: the module/workflow is governed (named in the master docs)
  and in most cases the backend logic is already built and accepted, but
  the specific callable surface the page needs does not yet exist (most
  commonly: internal-only today, no public/staff-facing projection route).
- **C — PROPOSED UI / FUTURE — NOT YET BACKED BY IMPLEMENTATION**: the
  underlying module has not been started at all (per §3).

**Note on A for Staff/Operations and Admin/Compliance:** per §3, no
staff/admin-facing public API exists yet anywhere in the platform — every
staff/admin capability is internal-service-only. **No page in either of
those two surfaces is classified A in this document.** A only appears for
Client Portal, and only for the one domain WLT-01's public contract
actually covers. B pages in Staff/Admin still represent real, often
fully-accepted backend logic — the gap is purely the missing staff-facing
API layer, not missing backend logic.

B and C pages must never be presented as live/current functionality. Per
§12 of the demo/unimplemented rule, any preview of a B or C page must
visibly carry one of: **DEMO**, **PROPOSED**, or **NOT YET BACKED BY
IMPLEMENTATION**.

---

## 6. Client Portal — Information Architecture (validated)

| Candidate (brief) | Decision | Class | Rationale |
|---|---|---|---|
| Overview | **Kept, redefined** as "Overview" | **B** | No portfolio/balance content (would require `LED-01`, not started — see next row). Composed of: client identity/status (needs a new public `CLT-01` projection route — `CLT-01` itself is complete internally), KYC/KYB status badge (needs a new public `KYC-01` projection route), and a registered-destination count (this part is **A** — see Wallet & Payout Destinations below). The page as a whole is **B** because at least one of its three widgets has no callable route yet; it must not be built as if all three did. |
| Portfolio / Account Overview | **Removed from initial IA** | **C** | Requires `LED-01` (Double-Entry Ledger / Client Balance), **not started**. Recorded as a future page, not built or previewed as live. |
| Wallet Destinations | **Kept**, renamed **"Wallet & Payout Destinations"** | **A** | `GET /wlt1/destinations`, `GET /wlt1/destinations/:destination_id`, `POST /wlt1/wallet-destinations`, `POST .../proof-of-control/challenges`, `POST .../proof-of-control/verify`, `POST /wlt1/payout-destinations` — real, accepted, callable (subject to `WLT1_PUBLIC_SURFACE_ENABLED` and, before any internet exposure, `FND-FIND-001`). Approval/screening/revocation stay staff-side (internal-only) — the client page shows status only, never a self-approve action (Role Matrix §13 Rule 6 equivalent: client cannot approve own withdrawal; the analogous rule here is the client cannot approve/screen their own destination). |
| Deposits | **Kept as future item, not initial** | **C** | `DEP-01`/`MON-08` Deposit Workflow, **not started**. |
| Withdrawals | **Kept as future item, not initial** | **C** | `WDR-01`/`MON-11` Withdrawal Workflow, **not started**. Payout-destination *registration* is already `A` (above) — withdrawal *execution* is not the same capability and is `C`. |
| Broking / RFQ | **Kept, renamed** per governed UI naming control (`00_Licence...` §11.1: "MB Spot Broking Terminal", not "Exchange Terminal") — **"OTC/RFQ"** and **"MB Spot Broking Terminal"** as two distinct future items | **C** | `PRD-07` OTC/RFQ, `PRD-08` MB Spot Broking Terminal — both under `TRD-01`, **not started**. |
| Orders / Activity | **Renamed** to **"Open Requests"** per the same UI naming control table (avoid "Orders") | **C** | `PRD-09` Quote Lifecycle, under `TRD-01`, **not started**. |
| Transactions | **Kept as future item** | **C** | Requires `LED-01`, **not started**. |
| Profile / Organisation | **Kept** | **B** | `CLT-01` is complete and governs exactly this data (client profile, authorised users/parties, mandates), but every `CLT-01` route is `/internal/clt1/*` — no public self-service projection exists yet. |
| KYC / KYB / Compliance Status | **Kept, narrowed to status display only** (no document upload/edit flow implied) | **B** | `KYC-01` is partial (through Phase 4B) and the case/outcome data model is real, but every route is `/internal/kyc1/*` — no public status-read route exists yet. |
| Notifications / Requests | **Removed as a standalone page** | **C** | No notification-delivery module (`FND-04` Notification Engine) has been built or evidenced anywhere in `platform/services/`. "Requests" (e.g. a pending wallet-destination approval) is already covered by the Wallet & Payout Destinations page's own status field — a duplicate standalone page would be redundant, not a new capability. Recorded as `C` in case a real notification capability is built later. |

**Client Portal, final initial-build candidate set (only A/B items — C items
are recorded for completeness, not for near-term building):**
Overview (B), Wallet & Payout Destinations (A), Profile / Organisation (B),
KYC/KYB Compliance Status (B).

---

## 7. Client Portal — Recommended Implementation Sequence

The brief's suggested sequence (Shell → Overview → Wallet Destinations →
Deposit/Withdrawal → Broking/RFQ → Orders/Transactions → Profile/KYC) is
**not adopted as-is** — it front-loads two `C`-classified flows (Deposit/
Withdrawal, Broking/RFQ) ahead of the one domain that is actually `A`. Per
this turn's own instruction ("do not commit this sequence if backend
evidence indicates a different safer order"), the backend evidence in §3/§6
indicates a different, safer order:

1. **Authenticated shell** (navigation, top bar, page-header pattern — no
   page content yet).
2. **Wallet & Payout Destinations** — the only page with a real, accepted,
   callable API (`A`). Building it first proves the shell against genuine
   data instead of a placeholder.
3. **Overview** — once the destination count (already available from step
   2) exists, Overview can show that one real widget plus explicitly
   `PROPOSED` placeholders for the client-identity and KYC-status widgets
   until their `B`-classified projection routes exist.
4. **Profile / Organisation** and **KYC/KYB Compliance Status** — these
   become buildable once a new public `CLT-01`/`KYC-01` read-projection
   route is implemented and accepted (a backend turn, not a UI turn) —
   sequenced here, not earlier, because building the page ahead of its data
   route would violate the Backend Reality Rule.
5. **Deposits, Withdrawals, OTC/RFQ, MB Spot Broking Terminal, Open
   Requests, Transactions** — all `C`. Not sequenced for near-term
   building; each requires its owning module (`DEP-01`/`WDR-01`/`TRD-01`/
   `LED-01`) to be implemented first. If previewed at all before then, each
   must carry an explicit `PROPOSED / NOT YET BACKED BY IMPLEMENTATION`
   marker (§16 of the turn brief).

---

## 8. Staff / Operations Portal — Information Architecture (validated)

Per §3, **no page below is `A`** — no staff-facing public API exists yet.
Every `B` item below names the real internal capability it would eventually
front, so the eventual staff-facing gateway/BFF work has a concrete target
rather than a guess.

| Candidate (brief) | Decision | Class | Backing evidence |
|---|---|---|---|
| Operational Overview | Kept | **B** | No unified aggregation route exists; would compose several internal sources below. |
| Client Requests | Kept, mapped to `CLT-01` applications | **B** | `GET /internal/clt1/applications`, `/internal/clt1/applications/:id` (onboarding application queue — real, complete). |
| Wallet Destination Review | Kept, mapped to `WLT-01` staff review capability | **B** | `POST /internal/wlt1/destinations/:id/approve/request`\|`/apply`, `GET /internal/wlt1/stuck-screenings`, `POST /internal/wlt1/rescreening-runs` — real, extensive, accepted. |
| Deposit Operations | Kept as future item | **C** | `DEP-01`/`MON-08`, not started. |
| Withdrawal Operations | Kept as future item | **C** | `WDR-01`/`MON-11`, not started. |
| Broking / RFQ Operations | Kept as future item | **C** | `TRD-01`, not started. |
| Settlement | Kept as future item | **C** | `MON-13`/`MON-14` (`LED-01`), not started. |
| Reconciliation | Kept as future item | **C** | `REC-01`, not started. |
| Exceptions / Breaks | Kept as future item | **C** | `MON-27` (`REC-01`), not started. |
| Maker-Checker Queue | Kept, mapped to `IAM-02` | **B** | `POST /iam2/approvals/request`, `/iam2/approvals/:id/approve`, `/iam2/approvals/:id/reject` — real, complete, `requireInternal`-guarded (not directly browser-callable today). |
| Audit / Activity | Kept, mapped to `SEC-01` | **B** | `GET /internal/sec1/audit-events/search`, `/internal/sec1/audit-events/read` — real, accepted. |

No queue name or workflow state above was invented — every `B` label names
the exact existing internal route(s) it maps to.

---

## 9. Admin / Compliance Portal — Information Architecture (validated)

Same rule as §8: **no page below is `A`**.

| Candidate (brief) | Decision | Class | Backing evidence |
|---|---|---|---|
| Compliance Overview | Kept | **B** | No unified aggregation route; would compose KYC-01/AML-01 sources below. |
| Client Risk / KYC-KYB | Kept, mapped to `KYC-01` | **B** | `GET /internal/kyc1/cases`, `/internal/kyc1/cases/:id`, `/internal/kyc1/cases/:id/outcome` — real, partial (through Phase 4B). **UI Phase 2N, §49.2: the list requires `application_id` or `client_id` — no cross-client read.** |
| AML / Transaction Monitoring | Kept, mapped to `AML-01` | **B** | `GET /internal/aml1/monitoring-runs`, `/internal/aml1/risk-signals`, `/internal/aml1/screening-requests` — real, partial (through Phase 3E). **Correction, UI Phase 2N (§49.2): `monitoring-runs` and `screening-requests` are `POST` only (plus `GET .../:id`); `risk-signals` requires `subject_type` + `subject_ref`; "monitoring" is periodic rescreening, not transaction monitoring.** |
| EDD / Review | Kept, mapped to `KYC-01` outcome-override | **B** | `POST /internal/kyc1/cases/:id/outcome-override/request`\|`/apply` — real. **UI Phase 2N, §49.2: no EDD model exists in code; outcome override is the nearest manual-review flow.** |
| Approval Queue | Kept, mapped to `IAM-02` (same capability as Staff/Ops Maker-Checker Queue, admin-scoped view) | **B** | Same `iam2/approvals/*` routes as §8. |
| Users / Roles / Permissions | Kept, mapped to `IAM-02` roles | **B** | `GET /iam2/users/:user_id/roles`, plus `IAM-01`'s session/account surface — real, `requireInternal`-guarded. **Correction, UI Phase 2N (§49.2): that route is `POST` (assign a role) only — no read.** |
| Feature Flags / Configuration | Kept, mapped to `CFG-01` | **B** | `POST /internal/cfg1/features/evaluate`, `/internal/cfg1/feature-changes/request`\|`/apply`, `/internal/cfg1/kill-switches/activate` — real, partial (through Phase 3B). |
| Audit / Sensitive Access | Kept, mapped to `SEC-01` | **B** | `GET /internal/sec1/audit-events/*`, `/internal/sec1/security-alerts/*` — real, accepted through Phase 5. **Correction, UI Phase 2N (§49.2, `UI-04` §48.1): these are `POST` (`search`/`read`).** |
| Reporting | **Removed from initial IA, kept as future item** | **C** | No `RPT-xx` module appears in the 17-module implementation-delivery list; no reporting route exists anywhere. |
| Incidents / Exceptions | Kept as future item | **C** | `INC-01`, not started. |

No page above was approved "because it sounds useful" — each row cites the
exact governed module and, where one exists, the exact route.

---

## 10. Permission-Aware Navigation Rule

Recorded verbatim as governing principle, to be enforced in every future
authenticated shell implementation:

> **HIDDEN NAVIGATION != SECURITY CONTROL.**
> **VISIBLE NAVIGATION != PERMISSION GRANT.**

UI visibility is presentation only. Backend authorization (`IAM-02`
permission checks, `requireInternal`/session guards, the Role & Permission
Matrix's default-deny model — `04_Role_And_Permission_Matrix_v1.2.md` §3.1)
remains the sole authority. Navigation *may* be permission-aware for
usability (e.g. do not show "Approval Queue" to a `CLIENT_USER`), but this
is a UX convenience, never a substitute for backend enforcement, and a
future page must never assume that hiding a nav item is sufficient
protection for the route or data behind it.

The governed role vocabulary (`04_Role_And_Permission_Matrix_v1.2.md` §5) is
the only vocabulary future navigation-permission logic may reference:
Client roles `CLIENT_OWNER` / `CLIENT_USER` / `CLIENT_APPROVER` /
`CLIENT_READONLY`; Staff roles `SUPPORT_AGENT`, `COMPLIANCE_ANALYST`,
`COMPLIANCE_OFFICER`, `DPO`, `MLRO`, `OPS_OFFICER`, `OPS_MANAGER`,
`FINANCE_OFFICER`, `FINANCE_MANAGER`, `ADMIN`, `SUPER_ADMIN`,
`SECURITY_ADMIN`, `TECH_ADMIN`, `MANAGEMENT`, `AUDITOR`. System roles
(`SYSTEM_JOB`, `INTEGRATION_SERVICE`, `AUDIT_SERVICE`, `LEDGER_SERVICE`)
must never appear in any UI role-selection or navigation-permission context
— the Matrix explicitly states system roles must not be used for human
login.

---

## 11. Selector vs. Authority Rule (Client Context)

Preserve the governed client authority chain exactly:

```
IAM authentication → user_class → CLT membership → lifecycle/eligibility → derived client authority
```

**`client_id` (or any future client/organisation selector) is never an
authority source** — it is presentation/context only. Conceptual UI
behavior (not implemented this turn):

- **Single eligible client:** context is automatic, no selector shown.
- **Multiple eligible clients:** an explicit selector is shown, but it may
  only ever list memberships the backend has already authorized — the
  selector reads existing authorization, it never grants it.

**Backend gap, recorded honestly:** the capability that would answer "which
clients is this authenticated user a member of" already exists —
`GET /internal/clt1/principals/:iam_user_id/client-memberships` — but it is
internal-only today. A public/staff-facing projection of this exact
capability is a near-term backend prerequisite for both the Client Portal's
context selector and any Staff/Admin "acting on behalf of client X" UI. This
document does not invent a client-switching API; it names the one gap that
must close before the selector can be built for real.

---

## 12. Route Architecture (proposed, not implemented)

`platform/apps/web/app/` currently has no route beyond `/` — there is no
existing convention to conflict with. Proposed prefixes:

| Prefix | Surface | Rationale |
|---|---|---|
| `/app/...` | Client Portal | Matches the brief's own suggestion; short, does not collide with `/` (public homepage) or any existing route. |
| `/ops/...` | Staff / Operations Portal | Matches the brief's own suggestion; covers Staff Portal + Operations Workspace + Support Workspace (§4). |
| `/admin/...` | Admin / Compliance Portal | Matches the brief's own suggestion; covers Admin Portal + Compliance Workspace + Finance Workspace + Management Dashboard (§4). |

Each prefix is a distinct Next.js route group with its own layout (its own
shell — §13), not a shared layout with conditional chrome. This directly
supports §4's "not one giant navigation tree" requirement and lets each
surface's shell evolve independently (e.g. Admin/Compliance's denser table
tiers vs. Client Portal's more comfortable tier — §19).

**Not decided in this document (backend-architecture question, out of UI
scope):** whether these route groups call `wlt1`'s public surface directly
(the only precedent that exists today) or through a future BFF/gateway
layer for the internal-only services named in §8/§9. This document records
the open question rather than inventing an answer — see §3's "no
staff/admin-facing public API exists yet" finding, which makes this
decision load-bearing for Staff/Admin, not yet Client Portal (where the one
`A` page can call `wlt1` directly, precedent-consistent).

Auth routes (`/login`, session handling) are not assigned a prefix decision
in this document — they sit outside all three portal prefixes and are
better resolved alongside the shell implementation itself, once real
`next-auth`-equivalent or custom session-cookie wiring is chosen (also out
of this document's scope: no package was evaluated or selected).

---

## 13. Shell Architecture

Desktop shell (≥1280px, see §17 for full responsive model):

```
┌─────────────────────────────────────────────┐
│ TOP BAR (context/header)                      │
├───────────┬───────────────────────────────────┤
│           │                                   │
│  LEFT     │  MAIN                              │
│  NAV      │  (content workspace)               │
│           │                                   │
└───────────┴───────────────────────────────────┘
```

- **LEFT:** primary navigation (§14).
- **TOP:** context/header bar (§15).
- **MAIN:** content workspace, itself governed by the page-header standard
  (§17) plus per-page content.
- **Right-side contextual panel:** not default. Only added where a specific
  workflow genuinely requires simultaneous reference + action (e.g. a future
  maker-checker detail view showing approval history alongside the decision
  form) — never as a persistent structural element. No such workflow is
  being built this turn, so no panel is specified yet.

Each of the three surfaces (§4/§12) gets its **own** instance of this shell
— same structural pattern, independently configured navigation/density —
not one shared shell with role-based content swapping.

---

## 14. Sidebar (design intent only — not implemented)

Design intent: **compact, measured, operational** — not a giant floating
glass panel, not icon-only mystery controls (Anti-"AI Look" Rules,
`UI-01` §4).

Provisional geometry, on `UI-02`'s existing 4px grid (`UI-01` §6: `4 8 12
16 20 24 32 40 48 64`) — **provisional, not implemented, subject to the
same design-review-required status every `UI-02` dimension carries**:

| Property | Provisional value | Note |
|---|---|---|
| Expanded width | `240px` (60 × 4px) | Common institutional sidebar width; final value pending a dedicated measurement turn, consistent with how `UI-02` §11 deferred floating-nav dimensions. |
| Collapsed width | Not yet justified | Collapse behavior itself is not yet justified — see below. |
| Row height | `40px` | Matches `UI-02`'s existing "default" control-height tier (`UI-02` control-height system) rather than inventing a new one. |
| Icon size | `20px` | Matches `UI-01`'s provisional Lucide icon scale (`16/18/20/24`) — mid-tier, consistent with a 40px row. |
| Group spacing | `24px` | One step up from `16px` item-internal spacing, on-grid. |
| Section-label treatment | Small-caps or `text-xs` uppercase label, `UI-02` typography-role "label" tier, not a new role. |

**Collapse is not assumed justified.** A collapse-to-icons mode adds real
interaction cost (users must remember icon meaning) and is only worth
building once a real screen genuinely needs the reclaimed width. Not
specified further; revisit when the first real shell is implemented.

---

## 15. Top Bar

Purpose: minimal context, not a feature dumping ground.

**In scope, conceptually:**
- page/section context (breadcrumb or title context — coordinates with the
  page-header standard, §16, so the two are not redundant)
- client/organisation context indicator (read-only display; selector only
  where §11 applies)
- environment/demo marker, where a page is showing `B`/`C`-classified
  content (§5)
- user menu (session/account actions — logout, profile link)

**Explicitly excluded, per this turn's instruction:**
- **Global search** — no cross-platform search requirement has been
  identified in any governed doc; not added by habit.
- **Notification bell** — no notification-delivery module exists (§6's
  "Notifications" removal); a bell with nothing behind it is exactly the
  kind of decorative-but-non-functional element `UI-01` §4 rejects.
- **Help** — only if a real help destination exists; none does yet.

---

## 16. Client / Organisation Context Model

Already stated in full at §11 (Selector vs. Authority). Restated briefly
for shell-design continuity: the top bar's context indicator (§15) is a
read-only reflection of the resolved client context — it never doubles as
the selector's only surface if a dedicated selector is needed; conflating
"where you see your context" with "where you change it" is a usability
decision for the eventual implementation turn, not fixed here.

---

## 17. Page Header Standard

One governed pattern, for every authenticated page:

```
[ breadcrumb / section context ]
[ Page Title ]                              [ primary action ] [ secondary… ]
[ short description — only when the title alone is ambiguous ]
```

- **Breadcrumb/section context:** small, precedes the title, gives the
  page's place in the current surface's navigation — not a duplicate of the
  sidebar's own active-item highlight, a genuinely different piece of
  information (path, not just "you are here").
- **Page title:** `UI-02`'s existing "page-title" typography role — **not**
  a new large decorative role, and **not** the sidebar label repeated in
  giant type merely for decoration (explicit instruction).
- **Short description:** only when the title alone would leave the page's
  purpose ambiguous (e.g. "Open Requests" arguably needs none; a page like
  "Evidence Export" might). Not a mandatory element on every page.
- **Actions:** at most one primary action, any number of secondary actions
  in a `DropdownMenu` once there are more than ~2 — not a growing row of
  equal-weight buttons.

---

## 18. Data Density System

Three conceptual tiers, all on `UI-02`'s existing control-height system
(no new arbitrary row heights):

| Tier | Use | Provisional row height |
|---|---|---|
| **COMFORTABLE** | standard forms, Overview-style pages | `48px` (existing "large" control-height token) |
| **COMPACT** | operational tables/queues (Wallet Destination Review, Maker-Checker Queue) | `40px` (existing "default" control-height token) |
| **DENSE** | audit/reconciliation/high-volume operations | `32px` (existing "compact" control-height token) |

No arbitrary row height between these three is permitted (`UI-01` §5's "No
Random Pixels" rule applies identically to authenticated density). Not
finalized without a later implementation-time review against a real table
of real data — recorded here as the governing *system*, not final numbers,
consistent with how `UI-02` treats every other provisional dimension.

---

## 19. Table System — Future Governing Rules (not implemented)

To be applied to every future authenticated table:

- **Header height:** matches the row-height tier in use (§18), not
  independently invented.
- **Row-height tiers:** exactly the three in §18 — no per-table one-offs.
- **Numeric alignment:** right-aligned, `font-variant-numeric: tabular-nums`
  (already anticipated in `UI-02`'s typography-role framework for the
  numeric-financial role).
- **Status alignment:** left-aligned with the status indicator (§21) leading
  the cell, not centered.
- **Action-column placement:** trailing (rightmost) column, consistent
  across every table — never leading, never mixed with data columns.
- **Overflow behavior:** the existing shadcn `Table` primitive's
  `tabIndex={0}`/`role="region"`/focus-ring pattern (already governed —
  `UI-03` §28, the `UI-QA-002` closure record) is the baseline; a genuinely
  new authenticated table need only add overflow if its own real content
  requires it, not preemptively.
- **Sticky header policy:** sticky within the table's own scroll container
  only (never the whole page) — for `DENSE`-tier tables specifically, where
  scanning a long list without a visible header is a real usability cost.
- **Pagination placement:** below the table, not floating.
- **Empty / loading / error states:** first-class, per §28.
- **Row selection policy:** only where a real bulk action exists (e.g. a
  future bulk maker-checker triage) — not added speculatively.
- **Keyboard accessibility:** every table must remain fully keyboard
  navigable, preserving the same discipline already proven on the public
  site's `PublicProductPreview` table (`UI-QA-002` closure).

---

## 20. Form System — Future Governing Rules (not implemented)

- **Label placement:** above the control (not inline-left), matching
  `UI-02`'s existing typography-role "label" tier.
- **Control height:** the existing 3-role system (`compact 32 / default
  40 / large 48`) — no new heights.
- **Help text:** below the control, `UI-02` "caption" role, only when the
  control's purpose is not self-evident from its label.
- **Error text:** below the control, replaces help text when present (never
  shown simultaneously with help text in the same slot), uses the
  status-system's "error" semantic (§21) — never color alone.
- **Required indicators:** a consistent single marker (e.g. `*` plus an
  `aria-required`), not per-field inconsistent wording.
- **Amount-input geometry:** dedicated tabular-numeric input, prefix/suffix
  (currency/asset symbol) as an affix inside the control boundary, not a
  separate floating label.
- **Field grouping:** related fields share one visual group with one group
  label, not each field boxed individually (avoids the "identical card
  treatment for every information type" anti-pattern, `UI-01` §4).
- **Section spacing:** the existing 4px-grid spacing scale, group-to-group
  spacing one tier larger than field-to-field spacing within a group.
- **Dangerous-action confirmation:** shadcn `AlertDialog` (not a plain
  `Dialog`) for any irreversible or fund-moving action, consistent with
  `Table`'s existing precedent of not shipping default shadcn behavior
  unexamined.
- **Maker-checker submission state:** after submission, the form must
  transition to a clear "submitted, awaiting approval" state (§22) — it
  must never appear to have "succeeded" in the same sense a non-approval
  action would.

---

## 21. Status System — Conceptual Semantics (colors not finalized)

Conceptual categories only — no hex values, consistent with `UI-01` §10
("values are not finalized... establishes the governance requirement"):

- **neutral** — informational, no judgment implied (e.g. "Draft")
- **informational** — active but not requiring attention (e.g. "Under
  Review")
- **pending** — awaiting an action from someone else (e.g. "Awaiting
  Approval", "Cooling-Off")
- **active / success** — completed or currently effective (e.g.
  "Verified", "Approved")
- **warning** — needs attention but not blocked (e.g. "Evidence Required")
- **rejected / error** — a negative terminal or failure state (e.g.
  "Rejected", "Screening Failed")
- **blocked / restricted** — access or action explicitly prevented (e.g.
  "Frozen", "Revoked")

**Status must never rely on color alone** — restates `UI-QA-006`'s own
finding (`UI-02` §25/§28.3), which is already an accepted-positive pattern
on the public site's demo table (text label + icon, not color-only) and is
adopted as the governing rule here, not reinvented.

**`Badge` vs. plain text/state indicator:** `Badge` is appropriate for a
short, scannable status token inside a dense table row or a page header
(one to two words, fixed-width friendly). Plain text with an inline icon is
preferred in a detail/timeline context (e.g. maker-checker history, §22)
where the status is one line among a narrative sequence, not a scannable
grid cell — using `Badge` there would revert to the rejected "excessive
pill elements" pattern (`UI-01` §4).

---

## 22. Maker-Checker UI Principles

The governed maker-checker workflow (`IAM-02`, `iam2/approvals/*`;
`04_Role_And_Permission_Matrix_v1.2.md` §3.4 "No Self-Approval", §23 Maker-
Checker Matrix) must be presented so the UI clearly distinguishes:

- **initiator** — who made the request, always shown
- **current status** — one of the §21 semantic states, never invented
  wording
- **required approver** — the role (not necessarily the specific person)
  required to act next, per the governed role matrix
- **approval history** — an ordered, append-only sequence (matches the
  backend's own append-only audit model — `SEC-01`, `OPS-01`/`OPS-02`)
- **rejection reason**, where applicable — always shown when status is
  rejected, never hidden behind an extra click
- **effective state after approval** — what actually changed as a result
  (e.g. "Wallet destination approved — now eligible for withdrawal use"),
  not just the bare status word

**The UI must never imply a maker can approve their own request** where SoD
(segregation of duties) forbids it — per §10's Role/Permission Rule, this is
presentation discipline only; the backend's own default-deny + no-self-
approval enforcement (`04_Role_And_Permission_Matrix_v1.2.md` §3.4) remains
authoritative regardless of what the UI shows or hides.

**No fake workflow states.** Every status word used in a maker-checker UI
must trace to a real backend state (e.g. `IAM-02`'s actual approval
statuses, `WLT-01`'s actual destination-approval states) — never an
invented UI-only intermediate state.

---

## 23. Audit / Sensitive-Read Principles

Where relevant, UI architecture should allow surfacing:

- **audit/event evidence** — who/when/action context, backed by `SEC-01`'s
  real audit-event model (`audit-events/read`, `audit-events/search`)
- **sensitive-read visibility** — the platform already enforces sensitive-
  read logging as a backend principle (`04_Role_And_Permission_Matrix_v1.2.md`
  §3.6); the UI's role is to make that evidence reviewable by an
  authorized compliance/audit role, not to duplicate the logging itself

**Which surfaces likely expose audit trails:** Admin/Compliance's "Audit /
Sensitive Access" page (§9) is the primary home. Staff/Operations' "Audit /
Activity" page (§8) is a narrower, operational view (e.g. "who touched this
wallet destination"), not the full sensitive-read log. **Ordinary Client
Portal screens must not surface audit internals** — a client-facing maker-
checker history view (§22) shows *their own* request's history, never raw
audit-log entries, actor internals, or other clients' data.

---

## 24. Responsive Authenticated Design

Desktop-only assumption is explicitly rejected (`UI-01` §9). Four
breakpoints, matching the existing public-site convention
(`UI-02`'s established `sm`/`md`/`lg`/`xl` usage) rather than inventing a
parallel scale:

| Range | Shell behavior |
|---|---|
| `≥1280px` (`xl:`) | Persistent left sidebar (§14), full top bar (§15). |
| `1024–1279px` (`lg:`) | Compact/collapsible navigation — sidebar may narrow or become an explicit toggle; not yet dimensioned (§14 marks collapse "not yet justified" — this range is exactly where that decision must be made during implementation, not here). |
| `768–1023px` (`md:`) | Navigation moves to a `Sheet`-based drawer (already in the component inventory, §26) rather than a squeezed sidebar. |
| `<768px` (mobile) | `Sheet` drawer navigation; operational tables (§19) must not simply horizontal-scroll the whole application — a genuine mobile representation (e.g. a card-per-row summary for `COMPACT`/`DENSE` tables) is required once a real table is implemented; not designed further here since no table exists yet. |

This mirrors the discipline already proven on the public site (`UI-02` §11,
§21–§26 — every public component has an explicit, deliberate mobile
treatment, never "desktop stacked").

---

## 25. Public vs. Authenticated Design Token Model

| Shared (public site + authenticated) | Authenticated-specific |
|---|---|
| base typography roles | surface hierarchy (elevated vs. base, per §18 density tiers) |
| focus states | table density (§18/§19) |
| 4px spacing grid | sidebar geometry (§14) |
| control heights (32/40/48) | status semantics (§21) |
| radii foundation | data-grid treatment (§19) |

**No duplicate token system.** Authenticated screens consume the same base
tokens `UI-02` already governs for the public site; only the
authenticated-specific column above needs new, additive tokens — never a
parallel redefinition of typography/spacing/control-height/radii, which
would violate `UI-01` §10's single-system governance requirement.

---

## 26. shadcn Component Adoption Map

Per this turn's explicit instruction: **no bulk install.** This table
records intent only — nothing below is installed this turn.

| Primitive | Likely use case | Portal(s) | Needed now? | Install when | AIX wrapper? |
|---|---|---|---|---|---|
| Button | actions everywhere | all | Already installed | — | No — already used as-is on the public site |
| Table | Wallet & Payout Destinations, every future queue/table | all | Already installed | — | **POTENTIALLY JUSTIFIED** — see §27 `AixDataTable` |
| Badge | status tokens (§21) | all | Already installed | — | **POTENTIALLY JUSTIFIED** — see §27 `AixStatusBadge` |
| NavigationMenu | not directly reused (authenticated nav is a sidebar, not a horizontal menu) | — | Already installed, unused in this scope | — | No |
| Sheet | mobile/tablet nav drawer (§24) | all | Already installed | — | No |
| Input | forms (§20) | all | Not yet | first real authenticated form | No |
| Label | forms | all | Not yet | with Input | No |
| Select | forms (e.g. destination chain selection) | Client Portal | Not yet | first form needing it | No |
| Checkbox | forms, table row selection (§19) | all | Not yet | first bulk-action table | No |
| RadioGroup | forms | Client Portal | Not yet | first form needing it | No |
| Tabs | page-level sub-views (e.g. Wallet Destinations: active vs. revoked) | Client Portal, Staff/Ops | Not yet | Wallet & Payout Destinations page implementation | No |
| Dialog | non-destructive modal flows | all | Not yet | first modal need | No |
| AlertDialog | dangerous/irreversible actions (§20) | all | Not yet | first fund-moving/irreversible action UI | No |
| DropdownMenu | page-header secondary actions (§17), user menu (§15) | all | Not yet | shell implementation | No |
| Popover | lightweight contextual info | any | Not yet | first real need, not speculative | No |
| Command | only if a real cross-platform search need is identified | — | **Not needed** — §15 explicitly rejects global search by habit | only if a genuine requirement is later identified | No |
| Tooltip | icon-only affordances, truncated content | all | Not yet | first icon-only control | No |
| Breadcrumb | page-header standard (§17) | all | Not yet | shell implementation | No |
| Separator | grouping (§20) | all | Not yet | first form/section needing it | No |
| Skeleton | loading state (§28) | all | Not yet | first data-fetching page | No |
| Pagination | table system (§19) | all | Not yet | first table exceeding one page | No |
| Form-related primitives | forms (§20) | all | Not yet | first real form | No |
| ScrollArea | only where native overflow genuinely misbehaves | any | Not needed yet | only if native overflow proves insufficient | No |
| Resizable | only if justified | — | **Not needed** — no split-pane requirement identified | only if a genuine requirement is later identified | No |

---

## 27. AIX Wrapper / Domain-Component Classification

Per `UI-01` §2.1 rule 9 and this turn's instruction — classified, **not
created**, this turn:

| Component | Classification | Rationale |
|---|---|---|
| `AixStatusBadge` | **POTENTIALLY JUSTIFIED** | The §21 status-semantics mapping (7 categories → consistent color/icon/text treatment) is repeated logic worth centralizing once ≥2 real screens need it — not yet, since zero authenticated screens exist. |
| `AixDataTable` | **POTENTIALLY JUSTIFIED** | The §19 table rules (tiered row height, numeric alignment, trailing actions, overflow/empty/loading/error states) are real, repeated, financial-domain behavior beyond shadcn `Table`'s own defaults — justified once the second real authenticated table is built, confirming the pattern actually repeats. |
| `AixAmountInput` | **POTENTIALLY JUSTIFIED** | §20's amount-input geometry (tabular numeric, prefix/suffix affix) is domain-specific enough to justify a wrapper, but no form exists yet to prove the exact shared shape. |
| `AixApprovalPanel` | **POTENTIALLY JUSTIFIED** | §22's maker-checker presentation (initiator/status/approver/history/reason/effective-state) is real regulated-workflow behavior, the clearest wrapper candidate in this document — but not created until the first real approval screen (Wallet Destination Review, Staff/Ops) is built and the shape is proven against real data, not designed in the abstract. |
| `AixAuditTrail` | **POTENTIALLY JUSTIFIED** | §23's audit-evidence presentation is repeated across at least two surfaces (Staff/Ops "Audit/Activity", Admin "Audit/Sensitive Access") by design — a real candidate, deferred until both exist. |
| `AixRiskIndicator` | **NOT YET JUSTIFIED** | No screen in this document's initial build set (§7) needs a risk-specific (as opposed to general status, §21) indicator yet — AML/KYC risk-scoring UI is itself `B`/`C` (§9), not sequenced. |
| `AixTransactionTimeline` | **NOT YET JUSTIFIED** | Depends on `LED-01` (transaction data), `C`-classified — no real data to design a timeline against. |
| `AixEmptyState` | **POTENTIALLY JUSTIFIED** | §28's empty-state requirement is genuinely repeated across every page in this document — plausible early wrapper, but still deferred until the first two real pages (Wallet & Payout Destinations, Overview) prove the shared shape rather than assuming it. |

**No wrapper is created this turn.** Per `UI-01` §2.1 rule 8, a thin
rename-only wrapper is explicitly prohibited; every "POTENTIALLY JUSTIFIED"
item above requires at least two real call sites before promotion to
"JUSTIFIED," consistent with the public site's own precedent (no domain
wrapper exists there either — `PublicHeader`/`PublicHero`/etc. are named by
role, not by shadcn-wrapping, and none of them wrap a single shadcn
primitive 1:1).

---

## 28. Empty / Loading / Error-State Model

First-class states for every future data-driven authenticated page, not an
afterthought:

- **loading** — `Skeleton`-based, shaped like the eventual content (not a
  generic spinner replacing the whole page)
- **empty** — genuinely zero records (e.g. no wallet destinations yet) —
  distinct copy from "error," with a primary action where one exists (e.g.
  "Register a wallet destination")
- **partial** — some data loaded, some failed (e.g. destination list loaded,
  status-refresh failed) — must not silently hide the failed portion
- **error** — the request itself failed — retry affordance, no fabricated
  data
- **permission denied** — the backend returned an authorization failure —
  distinct from "empty," must not be presented as if the feature does not
  exist when it does exist but is not permitted (a `403`-shaped state, not a
  `404`-shaped one)
- **feature disabled** — a real `CFG-01` feature-flag/kill-switch gate is
  active — distinct wording from "permission denied" (§29)
- **approval pending** — the maker-checker-specific state (§22), distinct
  from a generic "pending" status badge — it specifically means "waiting on
  someone else's action," and should say so

No page in this document's initial set (§7) is designed only for the happy
path — every future implementation turn building one of these pages must
account for all seven states above before the page is considered done,
consistent with `UI-01` §7's "screenshot-based visual QA... before page
acceptance" discipline extended to state coverage.

---

## 29. Feature-Flag UI Model

The UI must respect `CFG-01`'s real feature-flag/kill-switch model
(`/internal/cfg1/features/evaluate`, `/internal/cfg1/kill-switches/activate`
— real, partial through Phase 3B). Two conceptual treatments, chosen
per-capability, not universally:

- **hidden** — appropriate where showing the disabled capability at all
  would be confusing or would imply imminent availability the business has
  not committed to (e.g. Exchange-adjacent concepts, which stay hidden
  entirely per §13's license lock, never "visible but unavailable" —
  showing a disabled "AIX Exchange" nav item, even greyed out, would itself
  violate the regulatory UI boundary).
- **visible but explicitly unavailable** — appropriate where the business
  wants users to know a capability is coming (e.g. "Deposits" as a
  `C`-classified nav item, visible with a `PROPOSED` marker rather than
  hidden, so users understand the roadmap) — this is a deliberate business/
  governance choice per capability, not a default.

This document does not pre-select one universal policy — per this turn's
own instruction, that choice depends on context (specifically: license-
locked/Exchange-adjacent capabilities must default to **hidden**; ordinary
not-yet-built capabilities like Deposits/Withdrawals may default to
**visible but unavailable**, subject to a real product decision at
implementation time).

---

## 30. Measurement Discipline (restated for the authenticated platform)

Every rule already governing the public site continues to apply
identically: 4px base grid, exact spacing, consistent dimensions, 0px
mismatch for equivalent controls, governed row heights (§18), governed icon
sizes (§14), aligned baselines, aligned numeric columns (§19). No "close
enough" — `UI-01` §5 is not a public-site-only rule.

---

## 31. Design QA Requirements (future)

Every future authenticated screen requires, before acceptance: desktop,
tablet, and mobile visual QA (§24), matching the public site's own
discipline (`UI-02` §28's methodology — source/rendered-HTML/compiled-CSS
inspection where no screenshot tool is available). For data-heavy
operational screens (any `COMPACT`/`DENSE`-tier table, §18), additionally
required: table-density QA, overflow QA, keyboard QA, and empty/loading/
error-state QA (§28) — extending, not replacing, the existing methodology
(`UI-QA-002`'s keyboard-accessibility precedent is the model to repeat, not
reinvent).

---

## 32. Implementation Sequence (overall)

1. Authenticated shell (all three surfaces' route groups + layouts, §12/§13)
   — no page content.
2. Client Portal: Wallet & Payout Destinations (§7 step 2) — the one `A`
   page.
3. Client Portal: Overview, partially real (§7 step 3).
4. **Backend prerequisite turn(s), not a UI turn:** a public/staff-facing
   projection route for `CLT-01` profile/membership data and `KYC-01`
   status data (§3, §11) — without this, §6's `B`-classified Profile and
   KYC pages cannot become real.
5. Client Portal: Profile / Organisation, KYC/KYB Compliance Status, once
   step 4 lands.
6. **Backend/architecture prerequisite, not a UI turn:** resolve the
   staff/admin-facing API-access question named in §12 (direct internal
   calls are not possible from a browser; a gateway/BFF or new staff-facing
   routes are required) before any Staff/Ops or Admin/Compliance page can
   move past `B`.
7. Staff/Operations Portal and Admin/Compliance Portal implementation,
   sequenced by which `B` items get their access-layer prerequisite
   resolved first (Wallet Destination Review and Maker-Checker Queue are
   the most backend-complete candidates, per §8/§9).
8. `C`-classified pages across all three surfaces, each gated on its owning
   module (`DEP-01`/`WDR-01`/`TRD-01`/`LED-01`/`REC-01`/`INC-01`) actually
   starting implementation — not before.

Each step remains subject to `UI-01` §17's "one coherent UI scope per
session" discipline — this sequence names an order, not a bundling
instruction.

---

## 33. What This Phase Explicitly Did Not Do

- No authenticated route, page, layout, sidebar, dashboard, or component was
  created. `platform/apps/web/**` is byte-identical to baseline `41e76e4`.
- No shadcn component was installed (§26 is an adoption *plan*, not an
  installation).
- No package was installed; no lockfile changed.
- No final design token values were fixed — density row heights, sidebar
  geometry, and icon sizes above remain **provisional**, matching `UI-02`'s
  own existing provisional-value convention.
- No backend, API, database, migration, grant, or edge/perimeter artifact
  was touched.
- The public homepage was not reopened — `UI-02` §28.17's acceptance record
  stands unchanged.
- Final AIX font, palette, and brand asset remain **PENDING DESIGN
  APPROVAL** — unaffected by this document.

---

## 34. UI Phase 2B — Authenticated Shell Implementation Evidence

**Status: IMPLEMENTED.** This section records what was actually built against
§§4/12–19/24/26 above — the architecture this document specified is now real
code, not only a plan. Full measured geometry lives in `UI-02`'s own new
authenticated-shell section (cross-referenced below); this section records
route structure, component architecture, and implementation decisions.

### 34.1 Actual route structure

Exactly the three prefixes §12 proposed, each its own Next.js route group
with its own `layout.tsx`:

```
platform/apps/web/app/app/layout.tsx    → /app    (Client Portal)
platform/apps/web/app/app/page.tsx      → /app    (placeholder index)
platform/apps/web/app/ops/layout.tsx    → /ops    (Staff/Operations Portal)
platform/apps/web/app/ops/page.tsx      → /ops    (placeholder index)
platform/apps/web/app/admin/layout.tsx  → /admin  (Admin/Compliance Portal)
platform/apps/web/app/admin/page.tsx    → /admin  (placeholder index)
```

No sub-routes exist under any of the three — every approved nav item other
than each surface's own root (§34.4) has no destination page this turn, by
design (see §34.4's rendering decision).

### 34.2 Shared shell component architecture

```
components/shell/
  nav-data.ts               — surface metadata + typed NavItem[] per surface (CLIENT_NAV/OPS_NAV/ADMIN_NAV)
  nav-icons.tsx              — string-keyed icon resolution (see §34.3 for why this is separate)
  nav-list.tsx                — one shared nav-row renderer, used by both desktop and mobile nav
  authenticated-sidebar.tsx  — desktop persistent sidebar (≥1280px)
  authenticated-mobile-nav.tsx — Sheet-based drawer nav (<1280px)
  authenticated-topbar.tsx  — full-width top bar
  authenticated-shell.tsx   — composition root (topbar + sidebar + main), used by all 3 layouts
```

Named `Authenticated*`, matching the existing `Public*` naming convention
already established by the public-site components (`PublicHeader`,
`PublicHero`, etc.) — not a blind adoption of the brief's suggested names,
but a deliberate match to a convention already present in this exact
codebase before this turn started.

### 34.3 A real defect found and fixed: Server/Client prop-serialization boundary

The first implementation stored each `NavItem`'s `icon` as a direct Lucide
icon **component reference** (a function). `next build` failed prerendering
every one of `/app`, `/ops`, `/admin` with: *"Functions cannot be passed
directly to Client Components unless you explicitly expose it by marking it
with 'use server'."* Root cause: `nav-data.ts` is imported by each route's
`layout.tsx` (a Server Component — it exports `metadata`, which is only
valid in a Server Component), and that data is passed as props into
`AuthenticatedTopbar`/`AuthenticatedSidebar`/`AuthenticatedMobileNav`, all
marked `"use client"`. React Server Components cannot serialize a function
value across that boundary. **Fixed** by splitting icon *identity* from icon
*resolution*: `NavItem.icon` is now a string `NavIconName` (e.g. `"wallet"`,
`"home"`), and a new `nav-icons.tsx` module maps each name to its actual
Lucide component — imported and resolved only inside `nav-list.tsx`, which
always renders within the already-client-marked shell subtree, so the
function reference itself never crosses the Server→Client boundary. Verified
by a full `next build` afterward: `/app`, `/ops`, `/admin` all statically
prerender successfully (see §34.9).

### 34.4 Approved-but-unbuilt nav items: rendering decision

Every surface's approved nav list (§6/§8/§9) contains more items than this
turn built pages for — only each surface's own root/index item has a real
destination. Two options were considered and rejected before the
implemented one: (a) link every item to a not-yet-existing sub-route (would
404 — explicitly prohibited, and inconsistent with the public site's own
established "never route to something that 404s" precedent,
`public-header.tsx`'s own doc comment); (b) hide every item without a page
(would look identical to a `C`-classified suppressed item, losing the
distinction this document's own A/B/C framework exists to preserve).
**Implemented instead:** items without a page render as non-interactive,
muted rows (not a link, not a button, not focusable) with a visually-hidden
"— not yet available" note appended to the accessible name, so the
surface's full approved structure stays visible (proving the shell's
navigation model against the real IA) while nothing false is clickable and
nothing is silently hidden. This is a `NavList`-level rendering rule, not a
new document; recorded here as implementation evidence of §5's
classification discipline actually holding at the component level.

### 34.5 Client/organisation context — implemented as a static block, not a selector

Per §11's "Prefer simpler presentation for this turn," a selector was not
built. The Client Portal top bar (`/app` only) shows a plain, non-interactive
`<div>` (no `onClick`, no `role="button"`, not in the tab order) labeled
"Organisation context" / "Demo placeholder" — never a fabricated client
name. `aria-label` on the wrapper spells out explicitly that it is a demo
placeholder, not real client data, so the honesty constraint is legible to
assistive technology too, not only sighted users.

### 34.6 Account affordance — implemented as a disabled button

Per the brief's "no fake personal data" instruction: a `disabled` `Button`
with a generic `User` icon and the literal label "Account" — no name, email,
photo, role, or company identity invented. `disabled` was chosen deliberately
over a plain no-op enabled button so its non-functional state is
unambiguous and it does not create an empty tab stop.

### 34.7 Responsive model — implemented simplification, not a UI-04 contradiction

Per the brief's explicit permission: the 1024–1279px intermediate
"compact/collapsible" state §24 named as a conceptual option was **not**
built. Implemented instead: `≥1280px` (`xl:`) persistent 240px sidebar;
`<1280px` sidebar fully hidden, top-bar menu trigger opens the `Sheet`
drawer. This is recorded here as Phase 2B's own deliberate implementation
decision — §24's table is unchanged and still names the fuller conceptual
model as a future option, not superseded.

### 34.8 Shared nav-data strategy

Both `AuthenticatedSidebar` and `AuthenticatedMobileNav` render the same
`NavItem[]` (from `nav-data.ts`) through the same `NavList` component — no
hand-duplicated nav markup or data anywhere. `NavList`'s `variant` prop
(`"desktop" | "mobile"`) controls only whether real links are wrapped in
`SheetClose asChild` (so a mobile tap both navigates and closes the drawer)
— identical row geometry, labels, icons, and active-state logic either way.

### 34.9 Quality gates (all independently run, this turn)

`typecheck:web` (`next typegen && tsc --noEmit`) — 0 errors.
`lint:web` (`eslint`) — 0 issues.
`build:web` (`next build`) — succeeded after the §34.3 fix; all 6 routes
(`/`, `/_not-found`, `/admin`, `/app`, `/ops`) statically prerendered.

### 34.10 Verification method and its limit

No screenshot/browser visual tool is available this turn (none installed
solely for this purpose, consistent with every prior UI phase in this
project). Verification performed: a real `next dev` server was started, all
four routes (`/`, `/app`, `/ops`, `/admin`) confirmed `HTTP 200`; rendered
HTML for each authenticated route was fetched and inspected directly —
every approved nav label present verbatim (including the ampersand in
"Wallet & Payout Destinations," confirmed correctly HTML-entity-escaped,
not corrupted), zero `C`-classified labels present on any surface, exactly
one real nav link (the root) and the correct count of inert rows per
surface (3/4/7 for Client/Ops/Admin respectively, matching each surface's
total item count minus one), the mobile `Sheet`'s content confirmed absent
from the initial server-rendered HTML (Radix unmounts closed dialogs by
default — expected, not a defect), and the compiled CSS chunk was fetched
and inspected byte-for-byte to confirm every geometry value compiles to its
intended pixel figure (§34.9's sibling record, full table in `UI-02`'s new
authenticated-shell geometry section). **This is source/rendered-HTML/
compiled-CSS verification, not a claim of visual acceptance** — no browser
rendered these breakpoints for actual pixel/visual review this turn; that
review remains the user's own, exactly as every prior UI phase in this
project has required before a "visually accepted" claim could be made.

---

## 35. UI Phase 2C — Authenticated Platform Visual Direction

**Status: GOVERNED / DESIGN DIRECTION ONLY.** No CSS, component, or page
changed this turn. This section defines the visual language the
authenticated shell (`UI Phase 2B`, §34) will be styled against in a later,
separate implementation turn, and the direction future real pages (Wallet &
Payout Destinations, Client Requests, etc.) must follow once built. **Shell
visual acceptance remains PENDING; no real product page exists yet** —
nothing in this section changes either fact.

### 35.1 Reference registration — REF-UI-006 (ID correction from the brief's requested REF-UI-002)

This turn's brief asked to register Kraken Pro as `REF-UI-002`. **Verified
against the actual current Reference Register (`UI-01` §14) before
registering, per this project's own established discipline (the same
"verify against the actual register, do not silently overwrite" principle
applied in UI Phase 1R's accepted-risk-count reconciliation):**
`REF-UI-002` is already permanently assigned to **Fireblocks**
("Institutional blockchain storytelling," `REFERENCE / UNDER REVIEW`),
registered since UI Phase 0B, unchanged since. Overwriting it would corrupt
an existing governed reference silently — not done. Kraken Pro is
registered instead as **`REF-UI-006`**, the actual next-free ID (`001`
Phantom, `002` Fireblocks, `003` Anchorage Digital, `004` Copper, `005`
Revolut Business, all unchanged), added as a new row in `UI-01` §14's
Reference Register.

| Ref ID | Source | Status | Scope |
|---|---|---|---|
| `REF-UI-006` | Kraken Pro (`https://pro.kraken.com/`) | **APPROVED CONCEPT REFERENCE — AUTHENTICATED PLATFORM SCOPE ONLY** | Dense authenticated-workspace interaction/composition principles only (§35.2) — explicitly NOT the public marketing homepage, NOT a regulatory/product-scope reference, NOT layout/color/iconography/typography/component-styling to copy, NOT a statement about AIX's own available asset classes or feature availability. |

**Screenshot capture status: `VISUAL REFERENCE REGISTERED — SCREENSHOT NOT
LOCALLY CAPTURED`**, per this turn's own prescribed fallback. No browser/
screenshot tool is available in this environment (consistent with every
prior UI phase in this project); `pro.kraken.com` is additionally a
login-gated authenticated trading product, so even a live fetch would not
reach its actual dense-workspace UI without credentials this session does
not have and should not attempt to obtain. No image was fabricated or
substituted — `docs/04_ui/references/README.md` is updated accordingly
(§35's documentation-update record below), and the principle assessment in
§35.2 proceeds **conceptually**, from Kraken Pro's well-documented, publicly
known general UI characteristics (a dense multi-panel trading-terminal
layout, compact persistent navigation, restrained chrome) — the same
"conceptual tone only, not pixel-level" posture already governed for
`REF-UI-002`–`REF-UI-005` (none of which has a captured image either).

### 35.2 Kraken Pro principle assessment

| Principle | Verdict | Rationale |
|---|---|---|
| High information density | **APPROVED WITH AIX ADAPTATION** | Correct for Ops/Admin operational queues; Client Portal should sit toward the more comfortable end of the already-governed density tiers (§18/§35.14), not Kraken's own retail-trader intensity uniformly. |
| Compact navigation | **APPROVED** | Directly reinforces the already-implemented 240px/40px-row sidebar (`UI Phase 2B`, §34) — no change needed, the reference confirms the existing structural direction rather than requiring one. |
| Strong workspace hierarchy | **APPROVED** | Directly informs the Surface Hierarchy this section defines (§35.6). |
| Restrained spacing | **APPROVED WITH AIX ADAPTATION** | Restrained relative to the public marketing site's generous spacing — but AIX's own governed 4px-grid tokens (`UI-02` §3) remain authoritative; "restrained" means favoring the smaller end of that existing scale, not inventing tighter arbitrary values. |
| Low decorative overhead | **APPROVED** | Already governed independently — `UI-01` §4's Anti-"AI Look" rules; the reference reinforces, does not introduce. |
| Operational / command-center feel | **APPROVED WITH AIX ADAPTATION** | Fits Ops/Admin (queues, approvals, evidence) well; explicitly adapted — not adopted — for Client Portal, which must read as "financial infrastructure," never "trading-app entertainment" (this turn's own explicit prohibition, §35.4). |
| Modular panel composition | **APPROVED WITH AIX ADAPTATION** | Useful as a *composition* principle (§35.17's Panel System), but AIX's panel *types* are purpose-classified around regulated workflows (approval, evidence, form) — never Kraken's own trading-specific panel types (order book, depth, chart), none of which AIX may replicate (no order book, no market-making product). |
| Strong separation of primary/secondary work areas | **APPROVED** | Same reasoning as workspace hierarchy; directly informs the List+Detail adjudication (§35.16). |
| Compact controls | **APPROVED** | Matches the already-governed 32/40/48 control-height system (`UI-02` §4) — reinforces preferring the smaller end for operational contexts, introduces no new size. |
| Data-first layouts | **APPROVED** | Already governed — `UI-01` §3's "authenticated platform prioritizes data hierarchy... tables... forms." Reinforcing, not new. |
| Clear state/action hierarchy | **APPROVED** | Directly informs the Status System (`UI-04` §21) and Maker-Checker UI principles (`UI-04` §22), both already governed — reinforcing. |
| Visually quiet chrome | **APPROVED** | Directly informs Sidebar/Topbar visual direction (§35.10/§35.11) — no gradients, no heavy shadows, restrained borders. |
| Strong table/list/detail composition | **APPROVED WITH AIX ADAPTATION** | The *composition quality* (clear rows, numeric alignment, status columns) transfers; the *content types* (bid/ask ladders, live tickers) do not — AIX tables hold regulated records (destinations, approvals, audit trail), never live market data. |
| Persistent context while working | **APPROVED** | Reinforces the already-implemented persistent sidebar/topbar shell (`UI Phase 2B`) and the page-header/breadcrumb standard (`UI-04` §17) — no change needed. |

**No principle above required an outright REJECTED verdict** — all 14 are
legitimate UI/UX composition principles independent of Kraken's own
regulated trading capabilities, and each transfers either directly or with
a named, specific adaptation. The **capability-level** and **literal-copy**
exclusions below (§35.3) are a separate, harder boundary — not a 15th
"principle," but a hard product/regulatory lock this reference can never
override.

### 35.3 Regulatory / product-scope exclusions — REJECTED outright, no adaptation possible

Per `00_Licence_Scope_And_Feature_Lock_v1.3.md` (unchanged, not overridden
by any UI reference) and this turn's explicit instruction, the following
are **REJECTED**, not merely "adapted," because they are not styling
choices — adopting any of them would misrepresent AIX's actual licensed
scope:

- A live public order book, market-depth ladder, or any matching-engine
  visual (AIX has no Exchange approval; `00_Licence...` §6/§11.2).
- Margin, leverage, derivatives, futures, principal-dealing, or
  market-making controls/visuals of any kind.
- Staking, lending, or yield modules/visuals.
- Privacy-coin or algorithmic-stablecoin asset presentation.
- MYR trading pairs.
- Any UI element implying unapproved Exchange activity is live or
  imminent.
- Literal copying of Kraken's layout, colors, trade-terminal arrangement,
  iconography, typography, component styling, or product capabilities —
  the reference is principles only, never a visual clone target (this
  turn's own explicit "reference, not copy" instruction).
- "Trading-app entertainment" surface treatment — gamified fill
  animations, streak/reward mechanics, ticker-tape marquees, or any
  visual register associated with retail trading-as-entertainment
  products; AIX must read as **financial infrastructure**, not a crypto
  casino, retail exchange, gaming UI, or entertainment interface (this
  turn's own explicit framing, restated as governance here).

### 35.4 AIX product-model framing (restated as authenticated-visual governance)

AIX is not a retail crypto exchange. The authenticated visual direction
must read as **institutional financial infrastructure** for an
institutional/HNWI audience, reflecting the platform's actual governed
model: agency/back-to-back execution, maker-checker, pre-funded controls,
settlement, reconciliation, auditability, client authority, safeguarding,
compliance. Every visual decision in this section is made in service of
that framing, not general dashboard-aesthetic preference.

### 35.5 Light / Dark / Theme architecture — recommendation

**Recommendation: C — DUAL / THEME-CAPABLE ARCHITECTURE, with LIGHT as the
default/primary theme.** Not a personal-taste call — assessed against each
named criterion:

| Criterion | Assessment |
|---|---|
| Institutional readability | Light-on-dark-text has the most mature, best-understood contrast/legibility precedent for dense financial tables and compliance documents; a safer default with no final palette chosen yet. |
| Dense tables | Works well in either theme; not a deciding factor on its own. |
| Long operational sessions | Dark can reduce eye strain in low-light settings; light suits typical daylight office environments, which is realistically where Ops/Compliance staff work — not a clean win for either theme alone, which is itself an argument for offering both rather than forcing one. |
| Accessibility | Light-mode contrast tooling and precedent is more mature; dark mode requires deliberate glare/halation-avoidance tuning this turn cannot perform without a final palette — light is the lower-risk default today. |
| Current token architecture | **Decisive.** `app/globals.css` already carries a **complete, fully-wired `.dark` token set** (from the shadcn "Nova" init preset) alongside the `:root` light set — dual-theme capability already exists structurally at effectively zero marginal cost; not adopting it would waste tokens already present in the codebase. |
| Future charting | No blocker either way; charting libraries commonly support both themes. |
| Staff/Ops use | Long dense queues could benefit from an optional dark mode for power users — supported by "dual," not forced by it. |
| Admin/Compliance use | Evidence/audit review skews toward a light, document-like reading mode in most enterprise compliance tooling — favors light as the surface-appropriate default here specifically. |
| Client use | This turn's own brief prefers Client Portal "slightly more polished/comfortable" — light mode preserves visual continuity with the already-accepted, entirely-light public marketing site, easing the transition from public to authenticated experience without conflating the two governed visual modes (`UI-01` §3 keeps them distinct regardless of shared theme). |
| Implementation complexity | Building a fully-tested, contrast-verified dark mode across every future authenticated screen from day one is real, ongoing work this turn should not force. **The recommendation is architectural, not a commitment to ship a working theme toggle now** — token-driven theming stays available, default ships light, a toggle/persistence mechanism is separately scoped, later work. |

This is an **architectural direction, not a finalized palette** — no hex/
oklch values are chosen or changed by this recommendation (final palette
remains `PENDING DESIGN APPROVAL`, unaffected).

### 35.6 Surface hierarchy

Five tiers, each mapped to an **already-existing** token — no new CSS
variable is proposed, per "do not add measurements without reason":

| Tier | Purpose | Existing token(s) | Current usage |
|---|---|---|---|
| `BASE` | Page/workspace background | `--background` | Already used (`bg-background`, `UI Phase 2B` shell). |
| `SURFACE-1` | Sidebar/topbar (persistent chrome) | `--sidebar` / `--sidebar-foreground` | **Not yet adopted** — `UI Phase 2B`'s implementation currently uses plain `bg-background` (inherited) for both; this section recommends a future styling turn switch to the existing, currently-unused `--sidebar` family instead, which already carries a distinct (if subtle) tint from `--background` in the shipped token set. |
| `SURFACE-2` | Table/panel region | `--card` / `--card-foreground` | Exists, minimally used — closest existing semantic match; no new token needed. |
| `SURFACE-3` | Interactive/control region (inputs, selected states) | `--muted` / `--accent` / `--input` | Already exist and already used (`bg-muted` active-nav treatment, `UI Phase 2B`). |
| `OVERLAY` | Sheet/dialog/popover | `--popover` / `--popover-foreground` | Already used — `sheet.tsx`'s own `SheetContent` already carries `bg-popover text-popover-foreground`. |

**No card-border-everywhere default.** Borders are used only where §35.7
specifically calls for one — most `BASE`/`SURFACE-2` content is
distinguished by background tint and spacing alone, not a border.

### 35.7 Border hierarchy (provisional — final palette pending)

| Border type | Treatment |
|---|---|
| Default divider | Existing `--border` token (`border-border`), already used throughout the public site and `UI Phase 2B`'s shell — reused, not reinvented. |
| Strong divider | **Not a new, heavier border color** — `--border` and `--input` currently resolve to the identical value in the shipped light token set, so there is no distinct "stronger" border color to draw on yet. Strong separation is instead achieved by pairing the existing `border-border` with a **surface-tier background change** (e.g. `SURFACE-1`'s `--sidebar` tint against `BASE`) — directly reusing the precedent already established for the public `PublicFooter`→`PublicFinalCta` seam (a background-color transition plus a 1px border, `UI-02` §27), not inventing a new mechanism. |
| Focus ring | Existing `--ring` token, already wired into `Button`'s own `focus-visible:ring-3 focus-visible:ring-ring/50` — reused as-is. |
| Selected/active edge | Formalizing the pattern `UI Phase 2B` already implemented for active nav (`border-l-2`, using `--foreground`, not a new color) as the **governed authenticated selected-state pattern** — extended to table row selection (§35.15) for systemic consistency, not a one-off. |
| Danger/warning separation | Existing `--destructive` token (already used by `Button`'s `destructive` variant) — no new token needed. |

**Avoided, per this turn's explicit instruction:** thick card outlines,
every-box-bordered treatment, heavy shadows.

### 35.8 Radius — confirmed, not changed

`UI-02` §5's existing radius hierarchy (Micro 4px / Standard 8px / Cards-
panels 12px / Floating-nav full-pill / Full-pill controls) is **preserved
unchanged**. §5 already states authenticated surfaces "should stay at
Micro/Standard almost exclusively; Cards/panels only where a genuine panel
boundary exists, never as decoration" — this section confirms that rule
applies exactly as written to the shell and every future authenticated
page; no narrower authenticated-specific carve-out was found necessary.
Full-pill radius (the public floating nav's own scoped treatment,
`REF-UI-001`) is explicitly **not** used in authenticated UI.

### 35.9 Shadow — confirmed and extended slightly

`UI-02` §9 already states authenticated surfaces default to "a hairline
border... with little or no shadow except where a genuine floating/overlay
element requires depth (dropdowns, modals, toasts)." This section confirms
that rule and names the exact existing values already in use rather than
inventing new ones: sidebar/topbar — **no shadow** (confirmed by `UI Phase
2B`'s actual implementation, which carries none). Tables/panels — **no
shadow**. Dialogs/popovers — **existing `shadow-lg`**, already present in
`sheet.tsx`'s own `SheetContent` class — reused as the authenticated
platform's one governed elevation value, not a new one introduced.
Marketing-style floating/ambient shadows (the public site's `PILL_SURFACE`
`shadow-sm` treatment) are **not** carried into authenticated UI.

### 35.10 Sidebar visual direction

Structural geometry (240px / 40px rows / 20px icons, `UI Phase 2B` §34)
**preserved unchanged** — no defect found requiring revision. Visual
treatment:

- **Brand:** plain "AIX" text wordmark (already implemented) — no logo,
  brand asset remains pending.
- **Surface:** recommend adopting `SURFACE-1` (`--sidebar`/
  `--sidebar-foreground`, §35.6) in a future styling turn, replacing the
  current placeholder `bg-background`.
- **Section spacing:** the already-implemented 24px group spacing
  (`py-6`) is preserved.
- **Active item:** the already-implemented `border-l-2 border-foreground
  bg-muted font-medium` — formalized here as final governed treatment, not
  merely a Phase 2B implementation detail. No pill, no glow, no heavy
  shadow.
- **Inactive item:** the already-implemented `text-muted-foreground`,
  transparent left border, `hover:bg-muted` — confirmed final.
- **Icon treatment:** 20px (`UI-02` §14's "standalone action icons at
  Default control height," matching the 40px row), inherits the row's own
  text color (`text-current`) — no separate icon-color system; icons here
  are navigational, not status-bearing, so color independence is not
  required the way `UI-QA-006` requires it for status.
- **Text hierarchy:** brand wordmark small/semibold; surface label
  extra-small/muted (`UI-02` §6's existing Caption role); nav item label
  Body-adjacent, Medium weight only when active — no new type role
  introduced.
- **Bottom utility region:** **not added.** No real utility content (e.g.
  logout) justifies one yet, since no authentication exists — deferred
  rather than built speculatively.

**Explicitly avoided:** large rounded pills on every nav item, heavy
gradients, a floating sidebar card, glassmorphism.

### 35.11 Top bar visual direction

Structural geometry (56px, `UI Phase 2B` §34) **preserved unchanged**.
Visual treatment:

- **Background/surface:** the Surface Hierarchy (§35.6) groups sidebar and
  top bar together as `SURFACE-1` — a future styling turn should apply the
  same `--sidebar` family to the top bar, replacing its current
  placeholder `bg-background`, for chrome consistency with the sidebar.
- **Border:** the already-implemented `border-b border-border` — confirmed
  final.
- **Page/surface label treatment:** the already-implemented small
  `text-sm font-medium` breadcrumb-style label — confirmed final.
- **Client-context placement:** right side (already implemented) — see
  §35.12 for the refined visual treatment.
- **Account affordance:** the already-implemented plain ghost button, icon
  + text, no avatar photo — confirmed final.

**No new features added** — this section governs the visual treatment of
what already exists structurally, not new top-bar content.

### 35.12 Client-context treatment

Must read as **current organisational context**, never a badge, a
permission grant, or a fake account switcher (this turn's own explicit
framing). `UI Phase 2B`'s current implementation (a bordered, padded box —
`rounded-md border border-border px-3 py-1.5`) risks reading slightly
badge-like due to its own visible border/background box. **Refined
direction for a future styling turn:** a plain inline text pairing (label
+ value, e.g. "Organisation context" in `Caption`-role muted text next to
the value in `Body`-role text), separated by a subtle `border-l
border-border` rather than a full bordered/backgrounded box — reads as
quiet contextual metadata, not an interactive or status-bearing element.
Remains a static, non-interactive presentation — no real switching is
built or implied; a selector is not adopted for this phase either (§11
already recorded "prefer simpler presentation," reaffirmed here).

### 35.13 Page-header visual standard

Confirms and adds vertical-spacing philosophy to `UI-04` §17's existing
pattern (breadcrumb → title → optional description → contextual actions):

- Breadcrumb-to-title gap: **4px** (`UI-02` `space-1`).
- Title-to-description gap (when a description is present): **8px**
  (`UI-02` `space-2`).
- Header-block-to-content gap: **24px** (`UI-02` `space-6`) — matching the
  shell's own already-implemented main-content `py-6`, so the header does
  not introduce a second, inconsistent vertical rhythm.

Title uses the existing `Page title` typography role (`UI-02` §6, 24–28px)
— **never** the public hero's `Display` role (40–64px). No marketing hero,
no large "Welcome back" message, no oversized decorative title — restating
`UI-01` §4's anti-pattern list in this specific context.

### 35.14 Data-density usage mapping

`UI-04` §18 already defines the three tiers (`COMFORTABLE` 48px /
`COMPACT` 40px / `DENSE` 32px) generically ("standard forms," "operational
tables/queues," "audit/reconciliation/high-volume"). This section adds the
concrete per-page mapping, cross-checked against — not blindly copied from
— that existing generic definition, which it matches exactly:

| Page (from `UI-04` §6/§8/§9's approved IA) | Tier |
|---|---|
| Client forms (Profile/Organisation edits, future) | `COMFORTABLE` (48px) |
| Standard lists (Wallet & Payout Destinations, Client Requests, Approval Queue, Wallet Destination Review) | `COMPACT` (40px) |
| Audit/reconciliation/high-volume (Audit/Activity, Audit/Sensitive Access, AML/Transaction Monitoring, Maker-Checker Queue) | `DENSE` (32px) |

**Admin/Compliance adaptation (§35.22):** evidence-review tasks
(Client Risk/KYC-KYB, EDD/Review) benefit from slightly more breathing room
than a high-frequency operational queue — these lean `COMPACT` rather than
`DENSE` even though they sit in the Admin surface, a deliberate exception
to "Admin defaults to dense," not an oversight.

### 35.15 Table visual direction

`UI-02` §15 already governs numeric alignment, restrained status
presentation, governed row heights, "no giant card wrapper," sticky
headers, and managed overflow — **confirmed unchanged**, not restated in
full here. This section adds the specifics `UI-02` §15 left open:

- **Header surface:** same background as body rows (no separate header
  tint) — visual distinction comes from weight/color plus a `border-b
  border-border` beneath the header row, per §15's own "distinct... not
  necessarily height" guidance, resolved concretely as weight+border, not
  a new surface tint.
- **Row separation:** hairline `border-border` between rows — **no zebra
  striping** (an older enterprise-table convention that adds visual noise
  `UI-01` §4 discourages; hairline dividers alone are sufficient at the
  governed row heights).
- **Hover:** subtle `bg-muted/50` — existing token, no new color.
- **Selected row:** the same `border-l-2 border-foreground` + `bg-muted`
  pattern already governed for active sidebar nav (§35.7/§35.10) — one
  consistent selected-state language across the whole authenticated
  platform, not a separate table-specific treatment.
- **Numeric alignment / status placement:** per `UI-02` §15/§6 — right-
  aligned tabular numerics; status leading its own cell, text/icon-based.
- **Actions:** trailing column; always visible at `COMFORTABLE`/`COMPACT`
  tiers (clarity/touch-target priority); may reveal on row-hover at
  `DENSE` tier only, to reduce visual noise in high-density queues — a
  named refinement, not a universal rule.
- **Sticky behavior:** per `UI-02` §15 — sticky header scoped to the
  table's own scroll container.
- **Empty/loading/error states:** reuse the already-governed conceptual
  model (`UI-04` §28) — a muted icon, short text, and a primary action
  where one exists; never an illustration or mascot.
- **Detail-pane interaction:** per-page decision, guided by §35.16 — not a
  universal rule.

### 35.16 List + Detail pattern — adjudication

**APPROVED WITH AIX ADAPTATION**, for the specific workflows named in this
turn's brief: Wallet Destinations, Client Requests, Maker-Checker, KYC
review, AML alerts, Audit evidence. **When it is appropriate:** the
workflow requires reviewing or acting on one record while keeping shared
list context visible — especially where maker-checker/SoD review benefits
from seeing history or evidence alongside the list, without losing one's
place in the queue. **When it is not appropriate:** simple single-record
self-service forms with no list context to preserve (e.g. a client editing
their own profile — a plain form page, no list needed); or content that
needs substantial dedicated real estate (e.g. a future full trade-
execution ticket with multi-panel market context, §35.20) — that likely
deserves its own dedicated workspace route rather than a cramped detail
sidebar. **Not created this turn** — no panel width, breakpoint collapse
behavior, or exact geometry is fixed here; that is implementation-turn
work once a specific page (most likely Wallet & Payout Destinations, §35.19)
actually builds it.

### 35.17 Panel system — classified by purpose, not generic cards

Explicitly avoiding "dozens of generic cards" (this turn's own
instruction) — five purpose-classified types, each with the minimum
styling its purpose actually requires:

| Panel type | Purpose | Treatment |
|---|---|---|
| `WORKSPACE PANEL` | Main content region of a page (e.g. a table + its toolbar) | Borderless; page-level spacing only, no card wrapper. |
| `DETAIL PANEL` | The List+Detail pattern's detail view (§35.16) | A single leading-edge border (`border-l border-border`) — never a full box. |
| `ACTION PANEL` | A focused region for taking a specific action (approving a request, confirming a destination) | One of the few places `SURFACE-2`/`SURFACE-3` distinction visually matters — a subtle `bg-muted` or full border is justified here, since the user needs a clear "this is where I act" cue. |
| `EVIDENCE PANEL` | Read-only audit/evidence display | Same restrained treatment as `DETAIL PANEL` (single leading border) — evidence review is a "read carefully" task that benefits from minimal visual noise, never heavier styling. |
| `FORM SECTION` | A grouped set of related form fields (`UI-04` §20) | Spacing + one small group label; a subtle `border-t` between sections only for unusually long forms where sectioning aids scanning — never a full box by default. |

### 35.18 Future Client Overview — rule only, not designed

**No default "4 KPI cards + chart + activity" template.** When Overview
(§6, currently `B`-classified) is eventually built, it must surface actual
operational status, funding/wallet/request context, and pending approvals
only when backed by real data (per the existing A/B/C classification
discipline) — **no fake metrics**, ever. Not designed further this turn.

### 35.19 Future Wallet & Payout Destinations page — provisional direction only

Likely the first real `A`-classified page (§7's implementation sequence).
Provisional direction, **not implemented**:

- A `COMPACT`-tier (40px row) list/table: destination label/address,
  network + asset type, status (text/icon, `UI-02` §15), approval state,
  trailing contextual actions (view proof-of-control, revoke where
  authorized).
- An optional right-side `DETAIL PANEL` (§35.16/§35.17) for a single
  destination's full proof-of-control/screening history — a strong
  List+Detail candidate per §35.16's own criteria (reviewing one record's
  evidence while keeping the list visible).

### 35.20 Future MB Spot Broking Terminal — reference boundary

Kraken's influence can be strongest here **later**, but strictly bounded.
**May eventually use:** a dense multi-panel workspace, market *context*
(indicative External LP Market Depth display — per
`00_Licence_Scope_And_Feature_Lock_v1.3.md` §11.1's governed term, never an
"AIX Order Book"), request/order entry (an OTC/RFQ-style quote request,
never a resting limit order), an activity/execution status view (governed
term: "Open Requests," never "Open Orders"; "Quote History," never "Order
Book History"). **Must never imply:** principal trading, market making,
margin, derivatives, futures, staking, or unsupported assets — restating
`UI-01` §13 and `00_Licence...` §11 explicitly in this authenticated-
visual-direction context, not a new rule, a reinforced one. Governed UI
terminology (`00_Licence...` §11.1) applies exactly, not loosely: "MB Spot
Broking Terminal," never "Exchange Terminal."

### 35.21 Staff/Operations Portal adaptation

Priority: queues, approval states, exceptions, settlement, review actions,
evidence, operational density. Kraken's influence here is **density,
workspace structure, and context persistence only** — explicitly **not**
market-trading aesthetics: no price tickers, no candlestick charts, no
buy/sell green/red trading color convention (Ops screens have no "buy" or
"sell" actions to color-code in the first place — the platform is agency
broking, not a trading interface for Ops staff either). Density tier:
predominantly `DENSE` (32px, queues) with `COMPACT` (40px) for simpler
request lists — per §35.14's mapping.

### 35.22 Admin/Compliance Portal adaptation

Priority: risk, KYC/KYB, AML, EDD, approvals, roles, feature flags, audit
evidence. UI favors **clarity, state, evidence, traceability** over visual
excitement — closer in spirit to a case-management/evidence-review tool
than a trading terminal; Kraken's density principle still applies but its
trading-specific "command-center" flavor applies **least** of the three
surfaces here. Per §35.14, evidence-review pages lean `COMPACT` rather than
uniformly `DENSE`, a deliberate exception favoring careful review over raw
throughput.

### 35.23 Iconography — usage mapping (confirms `UI-02` §14, no new sizes)

Lucide confirmed as the icon source (already in use, `UI Phase 2B`). Usage
mapped onto `UI-02` §14's existing sizes — no new size introduced:

| Context | Size | `UI-02` §14 basis |
|---|---|---|
| Navigation icon (sidebar/mobile nav) | 20px | "standalone action icons at Default control height" — matches the 40px nav row, already implemented. |
| Table/action icon (row-level actions, status icons) | 16px | "dense table-row icons" — fits both `COMPACT` (40px) and `DENSE` (32px) rows. |
| Standalone prominent action icon (e.g. a primary button icon) | 20px | Same "Default control height" basis as nav. |
| Inline with body/caption/label text | 16–18px | Direct application of §14's own inline-icon rows. |

**Status icon usage:** always paired with text (never icon-alone for
status — `UI-QA-006`'s "not color-only" precedent extended to iconography
generally). **Decorative icon containers avoided** unless they communicate
function — extending the public site's own Phase 1N precedent (circular
icon markers reduced from 3-of-4 to 1-of-4 sections) to authenticated UI:
no default icon-in-circle treatment.

### 35.24 Typography roles — usage mapping (confirms `UI-02` §6, no new roles)

This turn's requested 8 categories (page title, section title, table
header, body, metadata, label, numeric/data, helper/error) map directly
onto `UI-02` §6's **already-governed** roles — no new role is introduced:

| Requested category | `UI-02` §6 role |
|---|---|
| Page title | Page title (24–28px, Semibold) |
| Section title | Section title (18–20px, Semibold) |
| Table header | Label (12–13px, Medium/Semibold) |
| Body | Body (14–16px, Regular) |
| Metadata | Caption (12px, Regular/Medium) |
| Label | Label (12–13px, Medium/Semibold) |
| Numeric/data | Numeric/financial (13–16px, `tabular-nums`) |
| Helper/error | Caption (12px), colored via the Status System (§21) for error — not a new size role |

### 35.25 Status/color principles — confirmed, no new palette

Final palette remains **PENDING DESIGN APPROVAL** — no hex/oklch values are
chosen this turn. `UI-04` §21's 7 semantic categories and `UI-02` §17's
high-level color direction both stand unchanged. Restated once more,
explicitly, since this turn concerns visual direction: **status must never
rely on color alone** — every status presentation pairs text and/or icon
with any color treatment eventually chosen.

### 35.26 Visual QA targets (future — not performed this turn)

Once the shell is actually restyled per this section (a later, separate
implementation turn), visual QA must cover `1440`/`1280`/`1024`/`768`/`430`
across at minimum `/app`, `/ops`, `/admin`, inspecting: density, sidebar
balance, topbar balance, workspace width, responsive drawer behavior,
active-nav treatment, client-context presentation, surface hierarchy,
contrast, focus visibility, and overflow — extending, not replacing, the
methodology `UI Phase 2B` §34.10 already used (source/rendered-HTML/
compiled-CSS inspection where no screenshot tool is available).

### 35.27 Shell visual-acceptance status — restated, unchanged by this turn

**The authenticated shell (`UI Phase 2B`) remains NOT visually accepted.**
This section governs future visual direction; it does not itself constitute
a visual review or acceptance of the existing shell's current (unstyled,
placeholder-token) appearance. **No real product page has been
implemented.** Both facts are unchanged by this turn.

### 35.28 What This Phase Explicitly Did Not Do

- No CSS, component, or page in `platform/apps/web/**` was changed.
- No shell restyling was performed — the shell's actual rendered
  appearance is unchanged from `UI Phase 2B`.
- No new shadcn component was installed.
- No product page (Wallet & Payout Destinations, Client Overview, or any
  other) was built.
- No final color palette, font, or brand asset was chosen — all remain
  `PENDING DESIGN APPROVAL`.
- No working theme toggle was built — §35.5 is an architectural
  recommendation, not an implementation.
- The public homepage was not touched or reopened.
- No backend, API, database, migration, grant, or edge/perimeter artifact
  was touched.

---

## 36. UI Phase 2D — Authenticated Shell Visual Implementation + QA

**Status: STYLED / TECHNICALLY VERIFIED — RENDERED VISUAL ACCEPTANCE
BLOCKED.** §35's Phase 2C direction is now applied to the real shell code
(`UI Phase 2B`, §34). Every change was independently verified via
`typecheck:web`/`lint:web`/`build:web` (all pass) and direct
rendered-HTML/compiled-CSS inspection (§36.9). **It was NOT verified by an
actual rendered screenshot/browser review**, because no such tooling is
available in this environment — checked directly this turn (`ToolSearch`,
`package.json`/`node_modules` inspection, `PATH` lookups for Playwright/
Puppeteer/a headless browser binary — none found; a system Chrome/Safari
app exists on the host machine but this session has no mechanism to drive
it or capture from it). Per this turn's own explicit instruction — *"Do not
substitute source/CSS inspection for rendered acceptance"* — **the
authenticated shell is NOT marked VISUALLY ACCEPTED this turn.** The code
is real, committed, and technically sound; the rendered visual judgment
call this project has required before every prior "visually accepted"
claim (public homepage, `UI Phase 1B`/`1C`/`1R`) still belongs to the
user, using their own browser.

### 36.1 Sidebar — `SURFACE-1` treatment applied

`AuthenticatedSidebar`'s `<aside>` now carries `xl:bg-sidebar
xl:text-sidebar-foreground xl:border-r xl:border-sidebar-border` (was
plain `bg-background`/`text-foreground`/`border-border`, inherited/
generic). The brand block's own bottom divider switched from
`border-border` to `border-sidebar-border` (currently equal in value —
semantic correctness, not a visible change). Brand ("AIX") now uses full
`text-sidebar-foreground`; the surface label uses
`text-sidebar-foreground/60` (was `text-muted-foreground`), formalizing
"surface labels subordinate to AIX" as an explicit opacity relationship
rather than an unrelated token. **Structural geometry unchanged** — 240px
width, 40px rows, 20px icons, 24px group spacing all preserved exactly,
no defect found requiring revision.

### 36.2 Top bar — `SURFACE-1` treatment applied, client-context refined

`AuthenticatedTopbar`'s `<header>` switched from `bg-background`/
`border-border` to `bg-sidebar`/`border-sidebar-border`/
`text-sidebar-foreground` — grouped with the sidebar as one chrome tier,
per §35.6's own example. **56px height unchanged.**

**Client-context treatment refined** exactly as §35.12 directed: the
bordered/backgrounded box (`rounded-md border border-border px-3 py-1.5`)
is replaced with a plain inline text pairing (`Organisation` / `Demo
placeholder`, separated by a quiet `border-l border-sidebar-border pl-3`,
no background, no full border) — reads as contextual metadata, not a
badge. **A conservative breakpoint change accompanies this:** it now shows
only at `xl:` (was `sm:` up). This is a Phase 2D judgment call, not
directed verbatim by §35.12 — recorded honestly: with no rendered browser
available to confirm the tighter text pairing fits the 640–1279px tablet
topbar without collision alongside the mobile-nav trigger, page label, and
account button, the safer choice was to show it only where the topbar has
the most room (`xl:`, alongside the 240px sidebar) and to carry the same
context into `AuthenticatedMobileNav`'s Sheet header for every narrower
width instead (§36.3) — satisfying "if it cannot fit in topbar: move it
into the mobile Sheet" without needing to prove a fit that cannot be
confirmed without rendering it.

### 36.3 Mobile Sheet — restyled to match the sidebar, not a separate language

`AuthenticatedMobileNav`'s `SheetHeader` previously showed only a bare
`SheetTitle` (the surface label, shadcn's own default styling). Now
mirrors `AuthenticatedSidebar`'s brand block exactly: an "AIX" wordmark
(`text-sm font-semibold tracking-tight`, overriding `SheetTitle`'s default
`text-base font-medium` via the existing `cn` Tailwind-merge utility — not
a raw class concatenation, confirmed via direct inspection of the `cn`
package, so the override reliably takes effect) plus the subordinate
surface label beneath. For the Client surface, the same organisation-
context text pairing from §36.2 is repeated here (`border-t
border-border pt-3`, since it sits below the header rather than beside
page content) — carrying the context into every viewport below `xl:`
where the top bar itself no longer shows it. The Sheet's own container
(`OVERLAY` tier, `bg-popover`) is unchanged — already correct per §35.6,
not touched. Nav rows are unchanged by construction — `NavList` is one
shared implementation; restyling it once restyles both the sidebar and
the Sheet identically, so active state, inert/disabled treatment, and
icon sizing were never at risk of diverging.

### 36.4 Active / inert nav treatment

**Active-nav 2px leading edge preserved** — reviewed and found still
visually appropriate per this turn's own permission to keep it as-is; not
adjusted. **Inert-nav accessibility refined:** every `href`-less row now
carries `aria-disabled="true"` in addition to the existing sr-only "not
yet available" note — a direct response to this turn's "render as clearly
disabled/unavailable nav rows with accessible disabled semantics"
instruction. No "Coming Soon" badge or pill was added (would have
reintroduced a status-badge system this project has repeatedly declined
to build prematurely) — muted text plus the two accessible signals above
is the complete treatment. Confirmed via rendered-HTML inspection: exactly
3/4/7 `aria-disabled="true"` occurrences on `/app`/`/ops`/`/admin`
respectively, matching each surface's exact inert-item count.

### 36.5 Page-header — new shared `PageHeader` component

A new `components/shell/page-header.tsx` implements §35.13's exact
spacing (context→title 4px, title→description 8px, header→content 24px)
as one shared component — justified by three real call sites needing
byte-identical governed spacing (`UI-01` §2.1 rule 9), not a thin rename
wrapper. All three placeholder pages (`/app`, `/ops`, `/admin`) now render
through it. **`context` is omitted on all three** — each is its surface's
own root page with no deeper breadcrumb hierarchy yet, so a context label
above the title would only repeat information the top bar's own
breadcrumb (§34) and the sidebar's own active-nav state already show;
adding one would have violated this turn's own "avoid duplicated large
surface titles" principle extended to a third repetition. Titles use the
existing "Page title" role (`text-2xl font-semibold tracking-tight`) —
unchanged from Phase 2B, now flowing through the shared component instead
of being hand-typed identically on each page. **Placeholder content
remains unchanged in substance** — same explanatory one-line description
per surface, no card, table, chart, metric, or fake activity added.

### 36.6 Borders / radius / shadow — confirmed, one semantic correction

Border weights (1px, via Tailwind's default `border`/`border-b`/`border-l`
utilities) were already correct — unchanged. Radius (`rounded-md` = 8px on
nav rows, matching `UI-02` §5's Standard tier) — unchanged, no large-radius
container exists anywhere in the shell. Shadow — confirmed zero shadow
classes anywhere in `AuthenticatedShell`/`AuthenticatedSidebar`/
`AuthenticatedTopbar` before and after this turn; `Sheet`'s own existing
`shadow-lg` is untouched, per this turn's explicit "existing shadcn
behavior only" instruction. The one semantic correction: sidebar/top-bar
internal dividers now reference `--sidebar-border` instead of the generic
`--border` (§36.1/§36.2) — both tokens are currently equal in value, so
this is a correctness change for when a future palette turn diverges them,
not a visible change today.

### 36.7 Admin nav density — verified by arithmetic, not rendering

Admin's 8 nav items were checked for overflow risk without a browser, by
direct arithmetic against the already-implemented geometry: 56px brand
block + 24px top nav padding + (8 × 40px rows) + 24px bottom nav padding =
**424px** of sidebar content below the 56px top bar. Any viewport with
≥480px of usable vertical space below the top bar (i.e. almost any laptop
screen) accommodates this without triggering the sidebar `<nav>`'s own
`overflow-y-auto` scroll — already present, unchanged, and functions as
the safety net if a future surface ever needs more items than fit. Long
labels (e.g. "Feature Flags / Configuration," "Client Risk / KYC-KYB")
rely on the existing `truncate` (single-line ellipsis) treatment on each
row's label span — unchanged from Phase 2B, confirmed still present;
wrapping was not introduced, since a 40px row cannot comfortably
accommodate two text lines and truncation is the established, already-
governed choice for dense nav rows. **This is arithmetic/source
verification, not rendered confirmation** — recorded as such.

### 36.8 Accessibility — reviewed against the turn's checklist

- Nav landmarks: unchanged, already correct (`<nav aria-label="{surface}
  primary">` on both sidebar and Sheet).
- `aria-current="page"` on the active link: unchanged, already present.
- Inert items not keyboard-focusable: unchanged, already correct (plain
  `<div>`, no tabindex, no interactive role) — `aria-disabled="true"`
  added this turn as a supplementary signal (§36.4).
- Sheet trigger labelled: unchanged, already correct
  (`aria-label="Open navigation"`).
- Focus rings: unchanged — inherited from `Button`'s own
  `focus-visible:ring-3 focus-visible:ring-ring/50`, not overridden.
- Contrast under current tokens: **not independently re-measured this
  turn** — the sidebar/topbar switched from `--background` (pure white,
  `oklch(1 0 0)`) to `--sidebar` (`oklch(0.985 0 0)`, a 1.5%-lightness-
  point difference) against the same `--foreground`/`--sidebar-foreground`
  text color (`oklch(0.145 0 0)` either way) — the text/background contrast
  ratio is unchanged by this swap (the background barely moved, the text
  color did not move at all), so no new contrast risk was introduced, but
  this reasoning is arithmetic, not a measured/rendered contrast check.
- 40px nav touch targets: unchanged, preserved.
- Mobile controls not overlapping: reasoned via §36.2's conservative
  breakpoint choice, not rendered-confirmed.
- Semantic heading hierarchy: each placeholder page has exactly one `<h1>`
  (via `PageHeader`) — unchanged in substance, now guaranteed structurally
  identical across all three pages by the shared component.

### 36.9 Verification method performed (and its explicit limit)

A real `next dev` server was started; all four routes (`/`, `/app`,
`/ops`, `/admin`) confirmed `HTTP 200`. Rendered HTML for `/app`, `/ops`,
`/admin` was fetched and inspected directly: every new class
(`bg-sidebar`, `border-sidebar-border`, `text-sidebar-foreground`,
`aria-disabled="true"`, the `PageHeader`'s `mb-6` wrapper and `<h1>`
markup) confirmed present exactly where intended; the Client-only
org-context block confirmed present on `/app` and absent on `/ops`/
`/admin`. The compiled CSS chunk was fetched and inspected byte-for-byte:
`.bg-sidebar { background-color: var(--sidebar); }`,
`.border-sidebar-border { border-color: var(--sidebar-border); }`,
`.text-sidebar-foreground { color: var(--sidebar-foreground); }`, the
`text-sidebar-foreground/60` opacity variant's `color-mix()` progressive-
enhancement rule, and `.mb-6`/`.mt-1`/`.mt-2`/`.pl-3`/`.border-l` all
confirmed compiling to their intended values. **This confirms the code is
technically correct and wired as designed — it does not confirm the
result looks correct, balanced, or free of visual defects when actually
rendered in a browser**, which is precisely the gap this turn's own
explicit instruction anticipated and requires reporting honestly rather
than papering over.

### 36.10 Findings raised and remediated (technical, pre-visual)

One technical finding, found and fixed before any commit: none — no
build/type/lint defect was introduced by this turn's changes (all three
gates passed on the first run after the edits). The one genuine judgment
call requiring a deviation from literal instruction is §36.2's
conservative topbar-breakpoint choice for the client-context block,
recorded there in full rather than silently applied.

### 36.11 Remaining shell visual risks (unconfirmed, flagged for the user's own review)

Recorded honestly, since no rendered check was possible:

- Whether the sidebar/topbar's new `--sidebar` tint (`oklch(0.985 0 0)`)
  reads as a *visible, intentional* separation from the `--background`
  main content area, or as an imperceptible non-difference at typical
  monitor brightness/color settings — the two values are numerically
  close on purpose (no new color was introduced), but "close" and
  "visually distinct enough to read as SURFACE-1" are not the same
  question, and only a rendered check can answer the second one.
- Whether the client-context text pairing's new `xl:`-only visibility
  reads as a deliberate design choice or as a surprising disappearance
  when resizing a window across the 1280px breakpoint.
- Whether `PageHeader`'s spacing reads as intentionally tight (institutional,
  per §35's direction) or merely under-filled, given the placeholder pages
  have no content below the header to balance against yet.
- General cross-browser/OS font-rendering variance in how `text-sidebar-
  foreground/60`'s `color-mix()` opacity renders, which this session
  cannot observe.

None of these is a code defect — each is a genuine visual judgment that
requires eyes on a rendered page, which is exactly what this turn's own
gate exists to require before claiming acceptance.

---

## 37. UI Phase 2E — Wallet & Payout Destinations (first `A`-classified client page)

**Status: IMPLEMENTED / VISUAL QA DEFERRED.** The first real authenticated
client product page. Per this turn's explicit program decision, rendered
screenshot QA is **deferred, not blocked** — this is a different posture
than `UI Phase 2D` §36 (which stopped short of claiming acceptance because
no tooling was available and none was authorized to install): this turn's
brief explicitly instructs *"do NOT stop this turn because browser/
screenshot tooling is unavailable… do NOT claim visual acceptance… full
visual QA will occur after the authenticated UI build-out."* Accordingly
this section records structural/source/compiled-CSS verification (§37.11)
and explicit **DEFERRED** status, not a stop condition.

### 37.1 WLT-01 capability map (verified against actual backend source, not assumed)

Every row below was confirmed by reading the actual route/DTO source in
`platform/services/wlt1/src/routes/public/**` and
`platform/services/wlt1/src/lib/public/**` this turn — none assumed from
the Phase 2A capability summary alone.

| UI element | Governed backend capability | Route / evidence | UI status this turn |
|---|---|---|---|
| Destination list/table | List client's own destinations | `GET /wlt1/destinations` (`routes/public/destinations.ts`) | **A** — real route exists; **not called this turn** (UI-first, demo fixtures shown instead, §37.4) |
| Destination detail | Single destination read | `GET /wlt1/destinations/:destination_id` | **A** — real route exists; not called this turn |
| Add Destination — Wallet | Register a digital-asset wallet destination | `POST /wlt1/wallet-destinations` (`RegisterWalletDestinationBody`) | **A** — real route exists; form fields mirror the exact schema (§37.7), not called this turn |
| Add Destination — Bank Payout | Register a fiat payout destination (APAC) | `POST /wlt1/payout-destinations` (`RegisterFiatPayoutDestinationBody`) | **A** — real route exists; form fields mirror the exact schema (§37.7), not called this turn |
| Proof-of-Control (wallet ownership verification) | Challenge + cryptographic-signature verify | `POST .../proof-of-control/challenges`, `POST .../proof-of-control/verify` | **A route exists, but NOT represented in this UI.** Requires a live external-wallet signature (MetaMask/TronLink-class), genuinely out of scope for a UI-first, no-wallet-integration turn — faking it would be actively misleading, worse than omitting it. Recorded as an explicit scope boundary (§37.6), not silently dropped. |
| Current Proof-of-Control status | — | **No public GET exists for it.** Verified by re-reading every registered public route — confirmed absent. | Not shown anywhere — would misrepresent an unsupported read as operational. |
| First-use status | — | Not present anywhere in the public contract (grepped `first_use`/`first-use` across every public route/lib file — zero matches) | Not shown — no client-visible field exists. |
| Limits / velocity / concentration | — | Not present in the public contract (the only `limit`/rate-limit matches found are the list-pagination `limit` querystring param and `FND-01` abuse-protection rate-limiting — confirmed by reading the matched lines directly, not by the grep hit count alone) | Not shown — no client-visible field exists. |
| Maker-checker detail (approver, queue, SoD) | Internal only | Not present in the public contract — the only externally-visible signal is the coarse `status` enum itself | Represented ONLY via the mapped `status` label (§37.8) — no approver/queue/internal-role UI anywhere. |
| Balance / ledger / custody / settlement figures | Not owned by WLT-01 | N/A — confirmed absent from both `PublicWalletDestination` and `PublicFiatPayoutDestination` | Not shown anywhere on this page (§37.13). |

### 37.2 Route and navigation change

New route: `platform/apps/web/app/app/wallet-destinations/page.tsx` →
`/app/wallet-destinations`. `components/shell/nav-data.ts`'s
`CLIENT_NAV` entry for "Wallet & Payout Destinations" gained a real
`href` (was inert since `UI Phase 2B`) — the first nav item across all
three surfaces to transition from inert to live. Label preserved
verbatim, not shortened. No other Client/Ops/Admin nav item changed —
Profile/Organisation and KYC/KYB Compliance Status remain inert (no page
exists for either yet).

### 37.3 Page architecture

```
app/app/wallet-destinations/page.tsx        — route (Server Component)
components/wallet-destinations/
  destination-data.ts                        — types (mirror dto.ts exactly) + governed
                                                 label/status maps + demo fixtures
  destination-status.tsx                      — shared status Badge (table) / status line (detail)
  destination-table.tsx                       — the list/table (primary region)
  destination-detail.tsx                      — the detail content (shared: desktop panel + mobile Sheet)
  wallet-destinations-workspace.tsx           — "use client" composition root: selection state +
                                                 responsive List+Detail transformation
  add-destination-dialog.tsx                  — Add Destination Dialog (form → review, no submit)
```

No `AixDataTable`/`AixStatusBadge`/`AixApprovalPanel`/`AixAuditTrail`
wrapper created — per this turn's explicit instruction and `UI-04` §27's
own "POTENTIALLY JUSTIFIED... requires at least two real call sites"
rule, one page does not yet justify promoting any of them. Narrowly
named page components (`DestinationTable`, `DestinationDetail`) were used
instead, matching the brief's own suggested pattern.

### 37.4 Demo-data disclosure and fixture scope

No `fetch`, server action, or API call anywhere on this route — confirmed
by source inspection of every new file. `DEMO_DESTINATIONS`
(`destination-data.ts`) is a static, local, 5-row fixture array. An
explicit, visible-but-subordinate disclosure sits directly beneath the
page header: *"Interface preview — demo data. No live client records are
shown; backend integration is separate, later work."* (small `text-xs`,
`Info` icon, not a full-page disabled treatment — matching "must not make
the whole page look disabled"). All values are obviously fictitious:
addresses/account numbers use the exact real masking format
(`prefix••••••••suffix` for wallets — verified against
`safe-response.ts`'s own `maskAddress`; `••••suffix` for accounts —
verified against `account-identifier.ts`'s own `maskAccountIdentifier`)
but with fabricated digits; bank identifiers (`DEMOMYK1`, `DEMOSGS1`) are
deliberately non-BIC-shaped placeholders, not real or real-looking SWIFT
codes; no real people, companies, or bank accounts anywhere.

### 37.5 Destination categories represented

Exactly the two the governed contract supports — `wallet` and
`fiat_payout` (verified via `ALLOWED_DESTINATION_TYPES` in
`routes/public/destinations.ts`) — displayed as "Wallet" and "Bank
Payout." No third category invented.

### 37.6 Sensitive data and Proof-of-Control treatment

Every sensitive value shown is the **server-masked** value the public
contract itself returns (`address_masked`, `account_identifier_masked`)
— never a raw address/account number, and **no "Reveal" control exists
anywhere on this page**, per this turn's explicit instruction that
Sensitive Read governance existing elsewhere does not automatically grant
a client-facing reveal capability, and none was found to support one
here. Proof-of-Control is not represented at all (§37.1) — both because
no public read capability exists for its current status, and because the
interactive challenge/sign/verify flow requires a live external wallet
signature this UI-first turn does not integrate.

### 37.7 Add Destination — form fields and source contract

Every field in `add-destination-dialog.tsx` traces to the exact governed
request schema, verified this turn:

**Wallet** (`RegisterWalletDestinationBody`): `chain`+`network` (one
combined Select, restricted to the two backend-registered pairs —
`ethereum/mainnet`, `tron/mainnet`, per `lib/address/index.ts`'s own
registry — no third chain offered), `address` (required text),
`memo_tag` (optional text), `wallet_type` (`hosted`/`unhosted`/`unknown`),
`beneficiary_relationship` (`self`/`related_party`/`third_party`).

**Fiat** (`RegisterFiatPayoutDestinationBody`): `bank_country`
(`MY`/`SG`/`HK`/`ID` — the frozen v1 APAC registry,
`lib/fiat/country-profiles.ts`), `currency`/`rail` (derived read-only
text the instant a country is chosen — never an independent Select,
since the schema requires them to exactly match the country's frozen
profile; offering them separately would let a user construct a
combination the backend would reject), `beneficiary_type`
(`individual`/`corporate`), `account_identifier` (required text),
`bank_identifier` (required text, BIC), `branch_identifier` (required
only when `branchRequired` — true for Hong Kong only, per the frozen
registry's own `branchRequired` flag; hidden entirely for the other three
countries, not shown-but-optional). `account_identifier_type`
("local_account") and `bank_identifier_type` ("bic") are fixed literals
in the schema, not user choices — not rendered as fields.

**No API integration** — the dialog progresses `form` → `review`, never
`form` → `success`, since nothing is ever submitted. The review step's
own copy states explicitly: *"Interface preview — demo data. This does
not submit a real registration request; backend integration is separate,
later work."* Final action reads "Review Destination" (disabled until
required fields are filled); the review step's own closing action reads
"Close," never "Confirm" or anything implying a completed transaction.
`Idempotency-Key` (a real required header on both governed routes) is
deliberately not generated or exposed as a field — a wire-protocol
concern for the future integration turn, not something a user enters.

### 37.8 Status-state mapping

The exact `ALLOWED_STATUSES` tuple from `routes/public/destinations.ts`,
mapped to human-readable labels — no invented state, no invented word
like "Verified"/"Trusted"/"Safe"/"Approved by AIX":

| Governed backend status | UI label | Semantic category (`UI-04` §21) |
|---|---|---|
| `draft` | Draft | neutral |
| `pending_screening` | Screening in Progress | pending |
| `pending_review` | Pending Review | pending |
| `approved_pending_cooling` | Approved — Cooling-Off | pending |
| `active` | Active | active/success |
| `revoked` | Revoked | blocked/restricted |

Presented via one shared `DestinationStatusBadge`/`DestinationStatusLine`
pair (`destination-status.tsx`) — never color-only: every status carries
a distinct Lucide icon (`Circle`/`Hourglass`/`CheckCircle2`/`Ban`) plus
its exact label text; `Badge` uses the `outline` variant uniformly (no
per-status fill color, since no final status palette is approved,
`UI-02` §17). `Badge` is used in the table (short, scannable, per `UI-04`
§21's own rule); a plain icon+text line is used in the detail panel
(narrative/single-record context — `Badge` there would re-introduce
"excessive pill elements," `UI-01` §4).

### 37.9 Table / list geometry and detail-panel contents

Columns: **Destination** (masked address/account — the primary
identifier), **Type**, **Network / Country**, **Status**, **Registered**.
Deliberately NOT the brief's own "likely" 7-column list — "Approval /
Control State" was dropped (redundant: the contract has exactly one
`status` field, not a separate approval sub-state — a second column would
fabricate a distinction that does not exist server-side) and "Last
Updated" was renamed to "Registered" and bound to `created_at_utc` (the
only timestamp the contract returns — there is no `updated_at` to show,
confirmed by reading `dto.ts` directly). No separate "Actions" column —
the whole row is the single interactive unit (select → view detail),
avoiding a redundant column for one action already available via row
click. `COMPACT` density (40px rows, `UI-04` §35.14's mapping for
"standard lists"), hairline `border-b` dividers (the shared `Table`
primitive's own default, unchanged), no zebra striping, no giant card
wrapper (the table sits in a borderless `WORKSPACE PANEL`, `UI-04`
§35.17 — confirmed no wrapping `border`/`rounded-*` class anywhere around
`DestinationTable`).

Detail panel (`DestinationDetail`, shared verbatim between the desktop
panel and the mobile Sheet): primary identifier + type + status line,
then a `<dl>` of type-specific governed fields (wallet: network,
wallet type, relationship, memo/tag presence; fiat: country, currency,
bank identifier, branch where applicable, beneficiary type), then
"Registered." Single leading `border-l border-border` on the desktop
panel (`DETAIL PANEL`, `UI-04` §35.17) — no full box; the mobile Sheet
supplies its own `OVERLAY`-tier boundary instead, so `DestinationDetail`
itself carries no border of its own (reused identically in both
contexts, not duplicated).

### 37.10 List + Detail responsive transformation — structural viewport review

No rendered screenshot was taken (deferred, §37.11) — the following is
source-level/arithmetic reasoning, reported as such, not a rendered
observation:

- **1440px:** shell sidebar (240px, `xl:`) showing; content padding
  `xl:px-8` (32px each side). Available content width ≈
  1440 − 240 − 64 = **1136px**. `lg:grid-cols-[1fr_360px]` split active
  (`lg:` = 1024px, already passed) — table gets the flexible remainder
  (≈1136 − 360 − 24 gap ≈ **752px**), comfortable for 5 columns.
- **1280px:** same breakpoint state as 1440px (sidebar + `xl:px-8`
  active, split active). Available ≈ 1280 − 240 − 64 = **976px**; table
  ≈ **592px** — still comfortable.
- **1024px:** shell sidebar NOT showing yet (`xl:` is 1280px — the
  Sheet-drawer shell breakpoint, independent of this page's own `lg:`
  split breakpoint); content padding is `sm:px-6` (24px each side, since
  `xl:px-8` hasn't engaged). Available ≈ 1024 − 48 = **976px** — nearly
  identical to the 1280px case (no sidebar, but also less total width);
  split remains safe by the same arithmetic. This is the exact case
  `UI-04` §35.16 deferred and this page now resolves with real numbers.
- **768px:** below the page's own `lg:` (1024px) split breakpoint — the
  split collapses to list-only, full width (content padding `sm:px-6`,
  available ≈ 768 − 48 = **720px**, comfortable for a single table).
  Selecting a row opens the `Sheet` (right-side drawer, existing shadcn
  default width — `w-3/4` capped `sm:max-w-sm`/384px) showing
  `DestinationDetail`, per "prefer list/table with detail opened in
  Sheet" for the 768–1023px range.
- **430px:** shell itself already shows Sheet-drawer navigation (`<1280`,
  `UI Phase 2B`); this page's own list-only + Sheet-detail treatment
  (same as 768px) continues — content padding `px-4` (16px each side),
  available ≈ 430 − 32 = **398px**, workable for the 5-column table via
  the shared `Table` primitive's own existing horizontal-scroll
  container (`role="region"`, `tabIndex={0}`, unchanged) rather than
  forcing a redesigned mobile card list this turn — a real, deliberate
  choice: the existing scrollable-table mechanism (already governed and
  accessibility-proven, `UI-QA-002`'s precedent) was judged sufficient
  for 5 demo rows rather than building a second, parallel mobile-card
  representation for a page whose full visual QA is explicitly deferred
  anyway. Flagged as a candidate refinement for the consolidated visual
  QA pass, not implemented as a gap this turn.

### 37.11 Verification method performed this turn (source/compiled-CSS, not rendered)

A real `next dev` server was started; `/app/wallet-destinations`
confirmed `HTTP 200`, alongside regression checks on `/app`, `/ops`,
`/admin` (all still `200`, nav unaffected apart from the one intended
change). Rendered HTML inspected directly: the governed label appears
exactly 3 times (nav, top-bar breadcrumb, page `<h1>`), all 5 demo rows
present with correct masked values, all 5 status labels present, the
demo-data disclosure present, zero forbidden invented-status words
(*"Verified"/"Trusted"/"Safe"/"Approved by AIX"*), zero
Exchange/trading-terminology words, zero label renames. Compiled CSS
fetched and inspected byte-for-byte: `.lg\:grid-cols-\[1fr_360px\]` →
`grid-template-columns: 1fr 360px`, `lg:` breakpoint confirmed
`min-width: 64rem` (1024px exactly), `lg:pl-6` → 24px. Both `<aside>`
elements (shell sidebar, detail panel) confirmed present with distinct,
correct responsive classes. Accessibility markup confirmed present:
`tabIndex={0}` + `aria-selected` on every table row, the shared
scrollable-table `role="region"` wrapper unchanged. **This is
source/rendered-HTML/compiled-CSS verification only — no browser
rendered this page for actual pixel/visual review.** Per this turn's own
explicit program decision, that is not a stop condition here (contrast
`UI Phase 2D` §36) — it is recorded as **DEFERRED**, to be performed in
the consolidated visual QA pass after the authenticated UI build-out
completes.

### 37.12 Accessibility

Semantic `<h1>` via the shared `PageHeader` (now extended with an
optional `action` slot, §37.14). Table rows: `tabIndex={0}`,
`aria-selected`, `onKeyDown` (Enter/Space activates), avoiding a nested
interactive element inside a table cell for a single-action row. Dialog/
Sheet accessibility inherited unchanged from the shared shadcn
primitives (focus trap, `Escape`-to-close, labelled via
`DialogTitle`/`SheetTitle`). Every form input has an explicit
`<Label htmlFor>` pairing plus `aria-required="true"` on required
fields, with a visual `*` marker (`aria-hidden`, since the `aria-required`
attribute already carries the semantic). Status is never color-only
(§37.8). No inaccessible clickable `<div>` — the only "row-shaped"
interactive elements are semantically valid (`<tr tabIndex>` with
`aria-selected`, a well-established accessible-table-row pattern; the
Add-Destination category toggle uses real `<button aria-pressed>`
elements, not styled `<div>`s).

### 37.13 WLT ownership-boundary and Exchange-boundary confirmation

**No balance, ledger, custody, or settlement figure appears anywhere on
this page** — confirmed by source inspection: neither
`PublicWalletDestination` nor `PublicFiatPayoutDestination` (nor any
demo fixture) carries a balance/amount/currency-value field of any kind;
this page is exclusively about destination eligibility/registration
state, never account value. **No trading, spot order entry, order book,
pricing, or Exchange-availability element exists anywhere** — confirmed
absent from every new file; this page is unrelated to and does not
reference the future MB Spot Broking Terminal (`UI-04` §35.20) in any
way.

### 37.14 `PageHeader` extended with an optional action slot

`components/shell/page-header.tsx` gained an optional `action?: ReactNode`
prop, rendered inline with the title (right-aligned, same row) — `UI-04`
§17's "at most one primary action" pattern, now implemented for the
first time. The three existing placeholder pages (`/app`, `/ops`,
`/admin`) omit it (unchanged, still no action) — only this page passes
one (`AddDestinationDialog`), justified because the governed contract
actually supports registration (§37.1), not merely because "pages
usually have a button."

### 37.15 shadcn additions

`Dialog`, `Input`, `Label`, `Select` added via `npx shadcn@4.21.0 add`
(the project's established CLI/version) — **zero package.json or
package-lock.json change**, confirmed via diff; all four compose from
the `radix-ui` umbrella dependency already installed since `UI Phase 1A`.
`button.tsx` was offered for overwrite by the same command and
explicitly skipped (identical content) — the existing customized `Button`
was not touched. Each new primitive's own default control height (`h-8`,
32px) was left unedited in its source file, matching this project's
established precedent (`Button`'s own internal default is likewise never
edited — every usage overrides explicitly) — every usage in
`add-destination-dialog.tsx` overrides to `h-10` (40px, `UI-02` §4's
governed platform-wide default control height), not left at the
shadcn default.

---

## 41. UI Phase 2F — Client Overview (`B`-classified page)

**Status: IMPLEMENTED / VISUAL QA DEFERRED.** `UI Phase 2B`'s placeholder
Overview page is now the real Client Overview — still `B`-classified,
per §6/§7's original classification, reconfirmed rather than assumed
(§41.1). Same posture as `UI Phase 2E`: visual QA deferred by explicit
program decision, not a stop condition.

### 41.1 Why this page stays `B`-classified — capability map (verified against actual backend source, not assumed)

Every backend service's registered routes were re-scanned this turn
(`platform/services/{aml1,cfg1,clt1,fnd,iam,iam2,kyc1,sec1,wlt1}/src`) —
unchanged from `UI Phase 2A`/`2E`'s own findings: only `iam`'s `/auth/*`
and `wlt1`'s 6-route public contract are browser-callable; `clt1`,
`kyc1`, `aml1`, `cfg1`, `iam2`, `sec1` remain entirely internal.

| Overview UI element | Owned by module | Current backend route/contract | Client-facing? | Status |
|---|---|---|---|---|
| Client lifecycle status | `CLT-01` | `clt1.client_profile.status` — real column, real internal route `GET /internal/clt1/clients/:client_id/status`; real reachable-state enum `CLIENT_PROFILE_REACHABLE_STATUSES` (`active_limited`/`suspended`/`closed`, `lib/client-profiles.ts`) | No | **PARTIAL/B** — real module + real internal data model, no public projection |
| KYC/KYB case status | `KYC-01` | Real internal case model; real state enum `KYC_CASE_STATUSES` (`pending_documents`/`completed`/`remediation`, `lib/kyc-case.ts`), plus outcome states `pass`/`fail`/`remediation_required` (`lib/outcome-override.ts`) | No | **PARTIAL/B** — same reasoning |
| Eligibility | `CLT-01` (derived) | The exact concept `WLT-01` itself checks before allowing registration (`lib/clt1-client.ts`'s `checkClientStatus`) — a real derived boolean, not an invented UI notion | No (only consumed server-to-server by `WLT-01`) | **PARTIAL/B** |
| Wallet & Payout Destinations list/summary | `WLT-01` | `GET /wlt1/destinations` — the exact route `UI Phase 2E` already verified | **Yes** | **A-BACKED** (shown via the same demo fixture `UI Phase 2E` uses, not called this turn) |
| Attention items — destination-derived | `WLT-01` | Same `GET /wlt1/destinations`, filtered to non-terminal statuses | **Yes** | **A-BACKED** |
| Attention items — organisation-level (KYC) | `KYC-01` | Same as the KYC row above | No | **DEMO-ONLY** (uses the same governed terminology, not a live read) |
| Recent client activity | `SEC-01` (conceptually) | `SEC-01`'s audit-event routes are entirely internal (`/internal/sec1/audit-events/*`) — no client-facing activity feed exists anywhere | No | **OMITTED** — no aggregate feed exists to demo against; faking timestamps was explicitly prohibited this turn |
| Platform capability/access status | N/A — presentation of `UI-04` §6's own nav IA | `components/shell/nav-data.ts`'s `CLIENT_NAV` | N/A (UI-internal) | Shown as-is — exactly the 3 real Client Portal nav items, no `C`-classified item |

**No live client-facing aggregation route exists for organisation
status, KYC/KYB status, or a combined "overview" projection of any
kind** — this is the precise, verified reason the page remains
`B`-classified rather than being promoted to `A`.

### 41.2 Information architecture — validated against §41.1, not assumed

Of the brief's 5 candidate sections (Organisation Status / Attention
Items / Destination Summary / Capability Status / Recent Activity), 4
were implemented and 1 was omitted:

- **A. Organisation Status** — implemented, **demo-only** (labelled
  "Demo — no live projection yet" directly in the section itself, not
  only in the page-level disclosure).
- **B. Items Requiring Attention** — implemented, **mixed provenance**:
  destination-derived rows are `A`-backed (real contract shape); the one
  organisation-level row is demo-only. Each row's own nature is legible
  from context (destination rows link to the real Wallet page;
  organisation row does not).
- **C. Wallet & Payout Destinations Summary** — implemented,
  **A-backed**, reusing `UI Phase 2E`'s own `DEMO_DESTINATIONS` fixture
  directly (§41.4).
- **D. Platform Access / Capability Status** — implemented, showing
  exactly the 3 real `CLIENT_NAV` items, no `C`-classified item.
- **E. Recent Client Activity — OMITTED.** No client-facing activity/
  audit feed exists anywhere in the backend (§41.1's table) — this
  turn's own instruction is explicit that an absent aggregate feed must
  be omitted, not faked with invented timestamps/events. Recorded as a
  deliberate omission, not an oversight.

### 41.3 Layout and panel model

Asymmetric two-column at `≥1280px` (`xl:grid-cols-[1fr_320px]`):
primary column (Organisation Status → Attention Items → Destination
Summary, `gap-8`/32px between sections) beside a secondary column
(Platform Access) with a single leading `border-l` (`DETAIL/EVIDENCE
PANEL` treatment, `UI-04` §35.17) — not a full box. Below `xl:`: single
column, stacked in the exact same order. **Split breakpoint chosen at
`xl:` (1280px), not `lg:` (1024px, `UI Phase 2E`'s own List+Detail
breakpoint)** — a deliberate, explicit choice: this is the platform's
first purely-editorial asymmetric layout with no prior precedent to
reuse, so the split engages only where the shell's own sidebar also
engages, letting the 1024–1279px range simply stack (this turn's own
explicitly-permitted fallback) rather than requiring new arithmetic to
justify a split there.

No `OverviewCard`/`StatCard`/`MetricCard` created — each section is a
plain `<section>` with a `Section title` heading (`text-lg
font-semibold`), not a rounded card. Organisation Status and Destination
Summary use `WORKSPACE PANEL` treatment (borderless); Attention Items
uses a subtle `bg-muted/40` per-row background (`ACTION PANEL`-adjacent,
`UI-04` §35.17 — one of the few places that distinction visually
matters, since these rows represent "needs action" content); Platform
Access uses the same single-leading-border `DETAIL/EVIDENCE PANEL`
treatment as `UI Phase 2E`'s own detail panel.

### 41.4 Cross-page fixture consistency

`components/overview/overview-data.ts` imports `DEMO_DESTINATIONS`
directly from `components/wallet-destinations/destination-data.ts` — no
second fixture array. Both the Destination Summary section's counts and
the destination-derived Attention Items rows are computed from that same
imported array, so the Overview can never disagree with the Wallet &
Payout Destinations page about how many destinations exist or what
state they are in. Status presentation reuses the same shared
`DestinationStatusBadge` component both pages already share.

### 41.5 Organisation-status and attention-item terminology

No invented word — every label traces to real governed backend source,
verified this turn (full citations in §41.1's table):

| Concept | Governed values | UI labels used |
|---|---|---|
| Client lifecycle | `active_limited` / `suspended` / `closed` | Active (Limited) / Suspended / Closed |
| KYC/KYB case status | `pending_documents` / `completed` / `remediation` | Pending Documents / Completed / Remediation Required |
| Eligibility | derived boolean | Eligible / Not Eligible |

No "Healthy"/"Verified"/"Excellent"/"Compliant," no circular progress
chart, no "completion percentage," no invented risk/AML/compliance
score — all explicitly avoided per this turn's own prohibition.

### 41.6 Financial-data and Exchange-boundary confirmation

**No balance, available-funds, settled-funds, portfolio-valuation,
fiat-wallet-amount, or crypto-wallet-amount figure appears anywhere on
this page** — confirmed by source inspection of every new file; the
Destination Summary's only numeric value is a plain count of the same 5
demo fixture rows the Wallet page itself shows (transparently the same
data, not a fabricated metric). **No KPI cards, fake AUM, fake PnL, fake
percentage change, fake trading volume, fake market/price chart, "Welcome
back," or fake recent deposits/withdrawals** — none present, confirmed
by source inspection. **No Exchange/Spot Exchange/Trading/Markets/Order
Book/Market Data element anywhere** — confirmed absent; the MB Spot
Broking Terminal (`C`-classified) is not referenced in any form.

### 41.7 Profile/KYC and C-classified handling

Profile/Organisation and KYC/KYB Compliance Status appear ONLY as plain,
non-interactive rows in Platform Access, reading "Interface planned" —
**no route was created for either this turn**, and neither renders as a
clickable link (would be a fake link to a nonexistent page). No
`C`-classified capability (Portfolio, Deposits, Withdrawals, OTC/RFQ, MB
Spot Broking Terminal, Open Requests, Transactions) appears anywhere on
the page in any form — the safest default (omit entirely) was taken, per
this turn's own explicit instruction, rather than listing them as
"unavailable" (which would itself read as a teaser of future features).

### 41.8 Responsive behavior — structural reasoning (not rendered)

- **1440px / 1280px:** `xl:` engaged — asymmetric split active, shell
  sidebar showing (`xl:`, same breakpoint). Available content width
  arithmetic matches `UI Phase 2E`'s own §37.10 figures (≈1136px/976px)
  — comfortable for a 1fr/320px split.
- **1024–1279px:** below this page's own `xl:` split breakpoint — single
  column, stacked (deliberate choice, §41.3), avoiding the need to prove
  a split-column fit in this range at all.
- **768–1023px:** single column, stacked — same as 1024–1279px.
- **430px:** single column; content order top-to-bottom is exactly
  Overview title → demo disclosure → Organisation Status → Attention
  Items → Destination Summary → Platform Access, matching the brief's
  own required mobile order precisely. No dashboard-card stacking —
  every section is a plain, compact block with `gap-8` (32px) between
  sections, not a repeating card pattern.

No horizontal overflow risk — no fixed-width element wider than its
container exists on this page (unlike `UI Phase 2E`'s table, which has
its own governed horizontal-scroll mechanism; this page has no table).

### 41.9 Empty state, loading, and error readiness

Attention Items' empty state ("No items requiring attention.") is
implemented and reachable (not merely documented) — if
`DEMO_ATTENTION_ITEMS` were ever empty, this exact state renders,
calmly, not as an error. Destination Summary's empty-destinations
handling is inherited unchanged from `WalletDestinationsWorkspace`'s own
`EmptyDestinationsState` (not duplicated) whenever that component is
reused; this page's own compact summary would show "0 governed
destinations" text, consistent with the same zero-state language.
**No loading or error state was built** — no `fetch` exists on this
page to load or fail. Documented for the future integration turn: once
a real aggregation route exists, loading would replace each section's
content with a `Skeleton` matching its own shape (`UI-04` §28's already-
governed model), and error/permission-denied would replace a section's
content with the same restrained pattern already governed there — no
new state model is required, the existing one already covers this case.

### 41.10 Backend projection gaps (for a future integration turn — not built this turn)

Derived directly from §41.1's capability map, not invented:

1. **Client organisation-summary projection** — a public, client-scoped
   read exposing `client_profile.status` (lifecycle) and derived
   eligibility — `CLT-01` owns the data; no public route exists.
2. **KYC/KYB status projection** — a public, client-scoped read exposing
   the case-level status (and/or outcome) — `KYC-01` owns the data; no
   public route exists.
3. **Attention/action-items aggregation** — either a dedicated aggregate
   route, or client-side composition once (1) and (2) above exist
   alongside the already-public `GET /wlt1/destinations` (which alone
   already covers the destination-derived attention rows this page
   currently demos).
4. **Client-facing activity/audit projection** — `SEC-01`'s audit
   capability is real but entirely internal; a scoped, safe client
   projection would be required before a Recent Activity section could
   be built at all (deliberately not attempted this turn, §41.2).

### 41.11 Accessibility

One semantic `<h1>` ("Overview," via the shared `PageHeader`), one
`<h2>` per section (`Organisation Status` / `Items Requiring Attention` /
`Wallet & Payout Destinations` / `Platform Access`), each
`aria-labelledby`'d to its own section. Status is never color-only
(Organisation Status/Attention Items use plain text; Destination
Summary reuses `DestinationStatusBadge`, already icon+text per `UI Phase
2E` §37.8). Every link has a meaningful accessible name (destination
attention rows: full title text; "View Wallet & Payout Destinations":
full label, not "Click here"). Inert future items (Profile/KYC in
Platform Access) render as plain `<span>` text, never a focusable
element with no real destination. No clickable non-semantic `<div>`
anywhere — the one interactive attention-row pattern uses a real
`<Link>`; the non-interactive organisation row uses a plain `<div>` with
no click handler, `tabIndex`, or interactive role. Keyboard order follows
visual/DOM order throughout (no `tabIndex` overrides used anywhere on
this page).

### 41.12 Shared component extraction — `DemoDisclosure`

`components/shell/demo-disclosure.tsx` — the demo-data disclosure
treatment (small `Info` icon, `text-xs` muted, `mb-6` spacing) extracted
from `UI Phase 2E`'s inline implementation into one shared component,
now used by both `/app` and `/app/wallet-destinations` — genuinely
repeated, byte-identical structural behavior (icon + spacing + role),
parameterized only by its page-specific message text via `children`.
`UI Phase 2E`'s own page was updated to consume it too (removing the
now-redundant inline JSX there), so no duplicate disclosure
implementation exists anywhere.

### 41.13 Status-wrapper (`AixStatusBadge`) promotion — still not promoted

Reassessed per this turn's own explicit instruction. Three real call
sites now exist for the existing `Badge`-based status pattern (`UI
Phase 2E`'s table, its detail panel, and this page's Destination
Summary) — all via the SAME shared `DestinationStatusBadge`/
`DestinationStatusLine` pair, not three independent implementations.
**Repetition:** genuine, but already fully addressed by that one shared
component — there is no remaining duplication for a domain wrapper to
eliminate. **Semantic value:** the icon/label/category mapping is
already centralized in `destination-data.ts` and
`destination-status.tsx`. **Why direct composition remains sufficient:**
promoting to `AixStatusBadge` would only rename the existing shared
component, not add real value — `UI-01` §2.1 rule 8 explicitly prohibits
exactly that ("do not create thin wrappers merely to rename"). Default
expectation (not promoted) upheld — the repetition that exists is
already correctly centralized, not scattered.

### 41.14 shadcn / dependency impact

**None.** No new shadcn component installed this turn; every element on
this page composes from primitives already present (`Badge`, `Link`,
plain HTML). Zero `package.json`/`package-lock.json` change.

### 41.15 Verification method performed (source/compiled-CSS, not rendered)

A real `next dev` server confirmed all of `/`, `/app`, `/app/wallet-
destinations`, `/ops`, `/admin` at `HTTP 200` (regression-clean).
Rendered HTML inspected directly: exactly one `<h1>` ("Overview"), the
four expected `<h2>` headings in order, the demo disclosure text
present, all three Organisation Status values present, the KYC
attention item and destination-derived attention items present, the
Destination Summary's view-link and count summary present, exactly the
expected 1 "Available" / 2 "Interface planned" capability rows (the
apparent "4" raw substring count includes Next.js's own duplicate RSC
hydration-payload serialization of the same text, verified by inspecting
the surrounding context directly — not a rendering defect), and zero
forbidden dashboard/balance/Exchange words anywhere. Compiled CSS
fetched and inspected byte-for-byte: `.xl\:grid-cols-\[1fr_320px\]` →
`grid-template-columns: 1fr 320px`, `.xl\:pl-8` → 32px. **This is
source/rendered-HTML/compiled-CSS verification only — no browser
rendered this page for actual pixel/visual review.** Recorded as
**DEFERRED**, per this turn's own explicit program decision, not a stop
condition.

---

## 42. UI Phase 2G — Client Profile / Organisation (`B`-classified page)

**Status: IMPLEMENTED / VISUAL QA DEFERRED.** The second `B`-classified
client page, replacing `UI Phase 2B`'s never-built inert nav item with a
real page. Same visual-QA posture as `UI Phase 2E`/`2F`.

### 42.1 Field/capability map (verified against actual backend source, not assumed)

Every backend service's registered routes were re-scanned this turn —
unchanged from `UI Phase 2A`/`2E`/`2F`'s own findings: `clt1` remains
entirely internal, no public client-facing route exists anywhere in it.
Every field below was additionally traced to its exact source table/
schema/enum in `platform/services/clt1/src`:

| UI field/section | Owning module | Current model/route | Client-facing? | Status |
|---|---|---|---|---|
| Legal name | `CLT-01` | `clt1.client_profile.legal_name` | No | **PARTIAL/B** |
| Registration number | `CLT-01` | `clt1.client_profile.registration_number` | No | **PARTIAL/B** |
| Country of incorporation | `CLT-01` | `clt1.client_profile.country_of_incorporation` | No | **PARTIAL/B** |
| Entity type | `CLT-01` | `clt1.client_profile.applicant_type` (real enum `individual`/`corporate`/`institutional`, `routes/applications.ts`'s own `APPLICANT_TYPES`) | No | **PARTIAL/B** |
| Client classification | `CLT-01` | `clt1.client_profile.client_class` (real enum `institutional`/`hnwi`/`professional`/`retail`/`unknown`, same file's `CLIENT_CLASSES`) | No | **PARTIAL/B** |
| Client lifecycle | `CLT-01` | `clt1.client_profile.status` (real reachable-state enum, `lib/client-profiles.ts`) | No | **PARTIAL/B** — reused verbatim from `UI Phase 2F` |
| Authorised representatives (director/signatory/controller) | `CLT-01` | `clt1.authorised_party.party_type` (real enum, `lib/authorised-parties.ts`'s `AUTHORISED_PARTY_TYPES` — `signatory`/`director`/`controller`/`ubo`) | No | **PARTIAL/B** — real role vocabulary, no name field exists in the model either |
| Beneficial ownership (UBO) | `CLT-01` | `clt1.authorised_party` where `party_type='ubo'`, plus `ownership_percentage` column | No | **PARTIAL/B, minimal summary only** — percentage and identity detail deliberately withheld (sensitive) |
| Platform access users (`client_admin`/`client_maker`/`client_approver`/`viewer`) | `CLT-01` | `clt1.authorised_user.role` (real enum, `lib/authorised-users.ts`) | No | **OMITTED from this page** — an IAM/account-access concern, not organisation profile (explicit boundary, this turn's own instruction) |
| Registered address | — | **No address field or table found anywhere in `CLT-01`'s actual schema** — searched directly this turn (`address`/`registered_office` across every `clt1` source file); zero matches | No | **OMITTED** — no field concept exists in the model at all, not merely "no public projection" |
| Primary contact (name/phone/position) | — | Only `clt1.client_application.applicant_email` (optional) exists, and only on the pre-approval `client_application` row — never copied into the persisted `client_profile` at approval (verified: the `INSERT INTO clt1.client_profile` in `routes/decisions.ts` does not include it) | No | **OMITTED** — presenting an application-time email as an ongoing "primary contact person" would misrepresent its real scope; no name/phone/position field exists anywhere |
| KYC/KYB status | `KYC-01` | real internal case-status enum (`UI Phase 2F`'s own finding) | No | **PARTIAL/B** — reused verbatim from `UI Phase 2F` |
| Profile editing | — | No client-facing update route exists (`CLT-01` entirely internal) | No | **Read-only only** — no Edit button; one explanatory note instead |

**Two full candidate sections (Registered Address, Primary Contact) were
evaluated and OMITTED, not built as demo-only** — the key distinction
from `UI Phase 2F`'s "demo-only" sections: those had real governed
values with no public *projection*; these have no field *concept* at
all (Registered Address) or a field so scoped-mismatched to the page's
own subject that showing it would misrepresent reality (Primary
Contact). Recorded as a deliberate, evidenced omission, not an
oversight — per this turn's own "do not build fields just because they
are common in onboarding systems" instruction.

### 42.2 Route and navigation change

New route: `platform/apps/web/app/app/profile/page.tsx` → `/app/profile`
— chosen over `/app/organisation` to match `UI Phase 2E`'s own
established precedent (anchoring the route on the governed compound
nav label's first word: "Wallet & Payout Destinations" →
`/app/wallet-destinations`), not a fresh content-based judgment call.
`components/shell/nav-data.ts`'s `CLIENT_NAV` entry for "Profile /
Organisation" gained a real `href` — the second nav item to transition
from inert to live (after "Wallet & Payout Destinations," `UI Phase
2E`). Label preserved verbatim. No other nav item changed —
"KYC / KYB Compliance Status" remains the only inert Client nav item.
`UI Phase 2F`'s own `CAPABILITY_STATUS_ITEMS` (Overview's "Platform
Access" section) was updated in the same spirit: "Profile /
Organisation" now reads "Available" with a real link, matching reality.

### 42.3 Page architecture and shared client-demo-state extraction

```
app/app/profile/page.tsx
components/profile/
  profile-data.ts                    — authorised-party/UBO/completeness demo data
  organisation-summary.tsx            — OrganisationDetails + ClientClassification
  authorised-representatives.tsx      — AuthorisedRepresentatives (+ UBO summary line)
  profile-status.tsx                  — ComplianceSummary + ProfileCompleteness
components/client/
  client-demo-data.ts                 — NEW shared module (extracted this turn)
```

Per this turn's own "Overview and Profile must agree… consider
extracting a small client-demo-data.ts" instruction:
`components/client/client-demo-data.ts` now holds the single shared
source for `ClientLifecycleStatus`/`KycCaseStatus`/their label maps and
`DEMO_CLIENT_STATE` (extended this turn with organisation-identity/
classification fields). `UI Phase 2F`'s own `components/overview/
overview-data.ts` was refactored to import from it — `organisation-
status.tsx` (Phase 2F's component) needed **zero changes**, since
`overview-data.ts` re-exports the same names it always has (verified by
inspecting its own imports before and after the refactor). `UI Phase
2E`'s `DEMO_DESTINATIONS` was deliberately NOT moved into this shared
module — it is WLT-specific fixture data already correctly scoped to
`components/wallet-destinations/`, per this turn's own "do not move
page-specific WLT fixtures unless beneficial" guidance.

### 42.4 Page header, demo disclosure, and closing note

Title "Profile / Organisation," description "Review the organisation
information associated with your AIX client profile." — no marketing
language. `DemoDisclosure` (the shared component `UI Phase 2F`
extracted): *"Interface preview — organisation profile data is
demonstrative until the required client-facing profile projection is
implemented"* — same structural treatment as `UI Phase 2F`'s own
disclosure, wording specific to this page's own scope. A separate,
smaller closing note — *"Profile updates are not yet available in this
interface"* — sits at the page's own end, distinct from the demo
disclosure (a different concern: interaction capability, not data
provenance) — not folded into `DemoDisclosure` itself, and not built as
a second shared component for a single use site.

### 42.5 Sections implemented

- **Organisation Details** — Legal name, Registration number, Country of
  incorporation, Entity type. 2-column `dl` field grid at `lg:` (1024px)
  and up, single column below.
- **Client Classification & Lifecycle** — Client classification, Client
  lifecycle. Same field-grid pattern, separate section per the brief's
  own IA (distinct concept from static identity fields).
- **Authorised Representatives** — 2 demo rows (Director, Authorised
  Signatory — real `AUTHORISED_PARTY_TYPES` vocabulary, `ubo` excluded)
  plus one "Beneficial ownership: On file" summary line. **No
  representative name shown anywhere** — the real `authorised_party`
  table has no name field either, so this is more accurate to the real
  model, not less complete.
- **Compliance Summary** — one plain, non-interactive row ("KYC / KYB
  status → Pending Documents," reusing `UI Phase 2F`'s exact value) — no
  link (the dedicated KYC/KYB page does not exist yet), no case-
  management detail.
- **Profile Completeness** — three discrete states ("Organisation
  details → On file," "Authorised representatives → On file,"
  "Compliance information → Pending Documents," the last reusing the
  same KYC value again, not a second paraphrase) — **no percentage, no
  progress ring**, per this turn's explicit prohibition.

### 42.6 Editing model

**Read-only.** No client-facing profile-update route exists anywhere in
`CLT-01`'s registered routes (confirmed this turn). No Edit button
anywhere on the page — a single closing note (§42.4) explains this
plainly instead of shipping an inert or fake-functional button. Future
edit pattern (documented, not built): *Edit section → review changes →
submit update request → approval/review state* — matching `CLT-01`'s
own real request/apply maker-checker pattern already used for every
other mutation in that module (e.g. `authorised_party` add/update/
remove all follow a `.../request` → `.../apply` shape), so a future
implementation would extend an existing pattern, not invent a new one.

### 42.7 UBO / sensitive-data treatment

Beneficial ownership is represented ONLY as a single boolean-shaped
summary line ("On file" / "Not provided") — **no ownership percentage,
no party count, no identity/PII of any kind**, even though the real
`authorised_party` row carries an `ownership_percentage` column. No
passport/identity-document numbers, no bank details, no wallet
addresses, no internal compliance evidence anywhere on this page.

### 42.8 KYC/AML and IAM/account boundaries

**No internal compliance data leaks:** no risk rating, AML score, EDD
notes, STR reference, transaction-monitoring alert, or analyst comment
appears anywhere — none of that is client-facing in the governed model,
and none was found or referenced. **No IAM/account-security scope:** no
password, MFA, session, or login-history content anywhere — `clt1.
authorised_user` (the platform-ACCESS-role model) is deliberately not
shown on this page at all (§42.1), preserving the IAM/CLT boundary this
turn's own instruction draws explicitly.

### 42.9 Responsive behavior — structural reasoning (not rendered)

- **≥1280px / 1024–1279px:** `lg:grid-cols-2` field grids active in
  Organisation Details and Client Classification & Lifecycle — every
  field label ("Legal name," "Registration number," "Country of
  incorporation," "Entity type," "Client classification," "Client
  lifecycle") verified short enough to stay readable at both widths.
  Authorised Representatives/Compliance Summary/Profile Completeness
  remain single-column list patterns at every width (list rows, not
  field grids — a grid does not suit list content).
- **768–1023px:** field grids collapse to single column (chosen over
  "selective 2-column," this turn's own permitted simpler fallback).
- **430px:** single column throughout; content order top-to-bottom is
  exactly PageHeader → DemoDisclosure → Organisation Details → Client
  Classification & Lifecycle → Authorised Representatives → Compliance
  Summary → Profile Completeness → closing note — matching this turn's
  own required order (adjusted only by omitting the two sections that
  were never implemented, §42.1).

No horizontal overflow risk — no table, no fixed-width element wider
than its container exists on this page.

### 42.10 Loading/error readiness

No `fetch` exists on this page — no loading or error state was built.
Documented for the future integration turn: identical to `UI Phase 2F`'s
own documented treatment (`UI-04` §41.9) — a `Skeleton` matching each
section's own shape, and the same restrained error/permission-denied
pattern already governed elsewhere; no new state model required.

### 42.11 Status-wrapper (`AixStatusBadge`) — not applicable this turn

This page uses no `Badge` at all — every value is plain text (legal
name, dates, role labels, "On file"), since none of it is a short,
discrete status token in the sense `UI-04` §21 reserves `Badge` for.
The existing promotion question (`UI Phase 2F` §41.13) is therefore
unaffected by this page — no new call site was added.

### 42.12 Accessibility

One semantic `<h1>` ("Profile / Organisation"). Five `<h2>` sections,
each `aria-labelledby`'d to its own heading. Semantic `dl`/`dt`/`dd`
used for every field-grid and status row. Status is never color-only
(plain text throughout — trivially satisfied, since no color-coded
element exists on this page at all). No fake disabled form fields for
read-only data — every field is plain text, never a disabled `<input>`
(this turn's own explicit instruction). No inaccessible clickable
`<div>` anywhere — the page has no interactive element beyond the
shell's own nav (the Compliance Summary/Profile Completeness/
Authorised Representatives rows are all deliberately non-interactive).
Mobile reading order matches DOM order (no `tabIndex` overrides used
anywhere on this page). The demo disclosure and closing note are both
plain readable text, no `aria-hidden` wrapping either.

### 42.13 Backend projection gaps (for a future integration turn — not built this turn)

Derived directly from §42.1's capability map:

1. **Client organisation-profile projection** — a public, client-scoped
   read exposing `client_profile`'s identity/classification/lifecycle
   fields (legal name, registration number, country of incorporation,
   applicant type, client class, status) — already identified as gap
   #1 in `UI Phase 2F`'s own record (`UI-04` §41.10); this turn adds no
   new organisation-identity gap beyond confirming its exact field
   shape.
2. **Authorised-representative projection** — a public, client-scoped
   read exposing `authorised_party` rows (role type only — `ownership_
   percentage` and any other sensitive column would need its own
   separate, explicit governance decision before ever appearing in a
   public projection, not assumed here).
3. **Beneficial-ownership summary projection** — narrower than #2: a
   boolean/count-only projection would suffice for this page's own
   minimal-summary treatment; a full detail projection is explicitly
   NOT requested here, consistent with §42.7's own restraint.
4. **Profile-update request endpoint** — a client-facing mutation
   following `CLT-01`'s own existing request/apply maker-checker shape
   (§42.6), not yet designed in any governed document; this turn only
   notes that the pattern to extend already exists internally.

No registered-address or distinct primary-contact-person gap is listed
— neither has a field concept in the governed model to build a gap
statement against (§42.1); if either becomes a real future requirement,
it would need new model design, not merely new API exposure of an
existing field.

---

## 43. UI Phase 2H — Client KYC / KYB Compliance Status (`B`-classified page)

**Status: IMPLEMENTED / VISUAL QA DEFERRED.** The third `B`-classified
client page. With this turn, every Client Portal nav item now has a
real page — the nav's own inert-row treatment (`NavList`, `UI Phase
2B`/`2D`) has no remaining live use case on this surface, though the
mechanism itself is unchanged and still governs Staff/Ops and Admin/
Compliance nav (both still partly inert).

### 43.1 Capability/status map (verified against actual backend source, not assumed)

Every backend service's registered routes were re-scanned this turn —
unchanged from every prior UI phase's own findings: `kyc1` remains
entirely internal, no public client-facing route exists anywhere in it.
Every concept below was traced to its exact source in
`platform/services/kyc1/src`:

| UI element | Owning module | Current model/route | Client-facing? | Status |
|---|---|---|---|---|
| Current KYC/KYB status | `KYC-01` | `kyc1.kyc_case.status` — real enum `pending_documents`/`completed`/`remediation` (`lib/kyc-case.ts`'s `KYC_CASE_STATUSES`) | No | **PARTIAL/B** — reused verbatim from `UI Phase 2F`/`2G` |
| Outstanding document items | `KYC-01` | `kyc1.checklist_item.status` — real enum `missing`/`received`/`verified`/`rejected`/`expired` (same file's `CHECKLIST_ITEM_STATUSES`); document types from `DEFAULT_CHECKLIST_BY_CASE_TYPE` | No | **PARTIAL/B** |
| Verification areas (rollup) | `KYC-01` | Derived from the real `KYC_CASE_TYPES` concept (`individual`/`entity`/`authorised_party`) and each type's own default checklist | No | **PARTIAL/B, broad rollup only** — not a literal 1:1 case-per-party projection |
| Beneficial ownership (rollup) | `CLT-01` | `clt1.authorised_party` where `party_type='ubo'` — reused verbatim from `UI Phase 2G`'s `UBO_ON_FILE` (moved to the shared `client-demo-data.ts` this turn, §43.3) | No | **PARTIAL/B, minimal summary only** |
| Engine-level outcome (`pass`/`fail`/`remediation_required`) and `outcome_reason` | `KYC-01` | `kyc1.cdd_outcome.outcome_status`/`.outcome_reason` (`lib/outcome-override.ts`'s `OVERRIDE_TARGET_OUTCOME_STATUSES`; `routes/outcome.ts`) | No | **OMITTED from this page** — an internal decision-record detail; `kyc_case.status` already reflects its practical consequence for the client (§43.2's full mapping rationale) |
| Document-submission/upload | `KYC-01` | No route found anywhere in the registered route set | No | **OMITTED** — no upload UI built; one explanatory note instead |
| Outcome delivery mechanism | `KYC-01` → `CLT-01` | `kyc1.outcome_publication` (`lib/outcome-publication.ts`) — delivers the aggregate outcome SERVICE-TO-SERVICE into `CLT-01` only (`status` there tracks delivery lifecycle: `pending`/`succeeded`/`failed`/`superseded` — its own header comment states "no CLT-01 client exists yet" as of Phase 2A of that module) | No | **Confirms no client delivery path exists at all** — not merely unexposed, structurally internal-to-internal |
| Risk rating / AML score / sanctions / PEP / STR | `AML-01`/`KYC-01` | Internal only; no client-facing field found anywhere | No | **OMITTED** — this turn's explicit default, independently confirmed by absence in the actual model |
| Source of Funds / Source of Wealth | — | **No field, case type, or document type found anywhere in `KYC-01`'s actual schema** — searched directly this turn | No | **OMITTED** — no field concept exists at all, same category as `UI Phase 2G`'s Registered Address omission |
| Business Activity | — | Same as above — zero evidence anywhere | No | **OMITTED** |
| Internal case-management detail (owner/reviewer/analyst/notes/queue/SoD role) | `KYC-01` | Not modeled in any client-facing form anywhere | No | **OMITTED** |

### 43.2 Internal → client-facing status mapping (the "which status, not which other status" question)

`KYC-01`'s model carries THREE distinct status concepts, verified this
turn — this section documents which one is client-facing and why the
other two are not, rather than silently collapsing them:

| Internal state | Client-facing label | Visible? | Rationale |
|---|---|---|---|
| `kyc_case.status = pending_documents` | Pending Documents | Yes | Primary "Current Status" — the case-level state is the coarsest, most stable, most genuinely client-relevant signal. |
| `kyc_case.status = completed` | Completed | Yes | Primary "Current Status." |
| `kyc_case.status = remediation` | Remediation Required | Yes | Primary "Current Status." |
| `cdd_outcome.outcome_status` (`pass`/`fail`/`remediation_required`) | — | **No** | An internal decision-ENGINE record tied to one specific computation event, not the durable case state; `kyc_case.status` is set FROM this value (`routes/outcome.ts`'s own `UPDATE kyc1.kyc_case SET status = $2, current_outcome_status = $3...`) but already carries its practical meaning for the client — showing both would either duplicate or (worse) desynchronize if a case is later remediated. |
| `cdd_outcome.outcome_reason` | — | **No** | Free-form internal reasoning text; not governed for client display. |
| `checklist_item.status` (`missing`/`received`/`verified`/`rejected`/`expired`) | Not Yet Submitted / Received — Under Review / Verified / Resubmission Required / Resubmission Required (Expired) | Yes, per-item | The per-document granularity IS genuinely client-relevant — this is what "Outstanding Information" is built from (§43.5). |

### 43.3 Route, navigation change, and shared-state extension

New route: `platform/apps/web/app/app/compliance-status/page.tsx` →
`/app/compliance-status` — this turn's own default suggestion, taken as
given rather than `/app/kyc`: the governed nav label ("KYC / KYB
Compliance Status") covers both KYC and KYB, and `UI Phase 2E`/`2G`'s
own "anchor on the label's first word" precedent does not transfer
cleanly here ("kyc" alone reads narrower than this page's actual
scope). `components/shell/nav-data.ts`'s `CLIENT_NAV` entry gained a
real `href` — the fourth and final Client Portal nav item to go live.
Label preserved verbatim.

`components/client/client-demo-data.ts` (extracted `UI Phase 2G`)
gained `UBO_ON_FILE`, moved from `UI Phase 2G`'s own `profile-data.ts`
— both this page's Verification Areas section and `UI Phase 2G`'s own
Authorised Representatives section now import the same value, so
beneficial-ownership state can never disagree between the two pages
either. `profile-data.ts` re-exports the same name — zero change
required to `UI Phase 2G`'s own consuming component.

`UI Phase 2F`'s Overview page received two small, well-scoped updates
reflecting this turn's new reality (not scope creep — the exact same
"the route now exists" logic already applied when `UI Phase 2G` moved
"Profile / Organisation" from "Interface planned" to "Available"):
`CAPABILITY_STATUS_ITEMS`'s KYC/KYB row now reads "Available" with a
real link; the organisation-kind `AttentionItem` now carries a real
`href` to `/app/compliance-status` (previously non-interactive, since
no page existed to link to). `UI Phase 2G`'s own Compliance Summary
row was similarly updated to link to the new real page — its original
"does not link anywhere" note is now historical, not current design
intent; the underlying no-fake-link principle is unchanged, only the
fact about what is real has moved.

### 43.4 Page architecture

```
app/app/compliance-status/page.tsx
components/compliance/
  compliance-data.ts          — checklist/document-type/verification-area demo data
  current-status.tsx           — CurrentStatus
  outstanding-information.tsx  — OutstandingInformation
  verification-summary.tsx     — VerificationAreas + NextSteps
```

### 43.5 Sections implemented

- **Current Status** — one prominent status line, reusing
  `DEMO_CLIENT_STATE.kycCaseStatus` directly. **No timeline/progress
  stepper** — evaluated and omitted: the governed model has exactly 3
  coarse case states, not a stable sequential pipeline found anywhere
  in the actual source (`remediation` is a RETURN transition, not a
  forward step — representing these three states as a linear progress
  bar would misrepresent the real state machine). No percentage, no
  progress ring.
- **Outstanding Information** — 2 demo items (Certificate of
  Incorporation: "Received — Under Review"; Authorised Representative
  Evidence: "Not Yet Submitted — action needed"), both real governed
  document types and checklist states, `ACTION PANEL`-adjacent
  treatment (same `bg-muted/40` pattern `UI Phase 2F`'s Attention Items
  already established). One explanatory note at the section's own end
  — *"Document upload will be available when the client document-
  submission service is integrated"* — since no upload route exists
  anywhere; no `<input type="file">`, no drag-and-drop, no upload
  button, confirmed absent by source inspection. Empty state ("No
  additional information is currently required.") implemented and
  reachable, not merely documented.
- **Verification Areas** — 3 broad rollup rows (Organisation Identity,
  Authorised Representatives, Beneficial Ownership), each "On file" /
  "Under Review" / "Pending Information" — never an internal
  verification method, provider score, screening hit, analyst note, or
  risk rating.
- **Next Steps** — one real link (`/app/profile`) plus a plain-text
  pointer to the Outstanding Information section already on the same
  page — no fake link to a document-submission page that does not
  exist.

**"Compliance Information On File" (candidate section E) was evaluated
and folded into Verification Areas rather than built separately** — a
third summary table repeating the same 3–4 facts already shown in
Current Status and Verification Areas would be redundant, and this
turn's own instruction explicitly cautions against recreating Profile's
own content on this page.

### 43.6 Sensitive/internal boundaries confirmed

**Beneficial ownership:** minimal "On file"/"Pending Information" rollup
only — no ownership percentage, party count, or identity detail,
confirmed absent by source inspection (same restraint as `UI Phase
2G`). **Source of Funds/Source of Wealth, Business Activity:** omitted
entirely — no field concept exists in the governed model (§43.1).
**EDD:** not referenced anywhere — no client-facing EDD wording
("Enhanced Due Diligence triggered," "High-risk client," "EDD case
open") appears; the generic "action needed" wording already used for
outstanding items is the only client-facing signal this page ever
shows for anything resembling additional review. **AML/screening:** no
sanctions match, PEP score, adverse media, transaction-monitoring
alert, screening-provider output, or STR status anywhere. **Risk
rating:** no score, no "Low/Medium/High Risk," no numeric rating, no
color-coded risk indicator anywhere — confirmed by source inspection.
**No case-management leakage:** no case owner, reviewer, analyst,
internal note, internal reason code, queue name, maker-checker role, or
internal audit-trail timestamp appears anywhere.

### 43.7 Rejected/failed and unknown-state readiness (not demoed, but mapped)

`remediation` (the client-facing "Remediation Required" case state) and
`rejected`/`expired` (checklist-item states, both mapped to
"Resubmission Required" variants, §43.2) are fully mapped in code —
this turn's own demo fixtures do not exercise the case-level
`remediation` state (the demo case sits at `pending_documents`,
matching the shared cross-page state), avoiding unnecessary alarming
demo data per this turn's own guidance, while the mapping itself
remains complete and ready. No "unknown status" fallback was needed in
code — `Record<ChecklistItemStatus, string>` and
`Record<KycCaseStatus, string>` (TypeScript-enforced exhaustive maps)
make an unmapped value a compile-time error, not a runtime "undefined"
render — a stronger safety property than a documented fallback string
would provide, satisfying "fail visually safe" structurally rather than
by convention.

### 43.8 Layout, panel model, and responsive behavior — structural reasoning (not rendered)

Asymmetric `xl:grid-cols-[1fr_320px]` layout at `≥1280px` (primary:
Current Status + Outstanding Information; secondary: Verification Areas
+ Next Steps) — the same split breakpoint and "split only where the
shell's own sidebar also engages" rationale `UI Phase 2F`'s Overview
page already established, reused rather than re-derived. Below `xl:`:
single column, stacked — order: PageHeader → DemoDisclosure → Current
Status → Outstanding Information → Verification Areas → Next Steps,
matching this turn's own required mobile order exactly (no section was
reordered or omitted from that sequence — every candidate section that
survived §43.1's evaluation appears in it). No horizontal overflow risk
— no table, no fixed-width element wider than its container exists on
this page.

### 43.9 Status-wrapper (`AixStatusBadge`) — reassessed a third time, still not promoted

This page uses no `Badge` at all (same as `UI Phase 2G` — every status
here is plain text: the large Current Status line, the Outstanding
Information rows' state text, the Verification Areas rollup values).
Reassessed per this turn's own explicit instruction with three real
client pages now built: the promotion bar (semantics repeat across
multiple domains; accessibility treatment repeats; direct composition
becoming error-prone) is not met — status presentation across the three
pages built so far takes three genuinely different shapes (a `Badge` in
Wallet & Payout Destinations' table, a plain status line in Overview/
Profile/this page), each already correctly matched to its own context
per `UI-04` §21's own guidance (`Badge` for scannable table cells,
plain text for narrative/summary contexts) — not evidence of
error-prone duplication, evidence of the existing rule being applied
correctly and consistently. Default (not promoted) upheld again.

### 43.10 Accessibility

One semantic `<h1>` ("KYC / KYB Compliance Status"). Four `<h2>`
sections, each `aria-labelledby`'d to its own heading. Status never
color-only (plain text/icon-free throughout — no colored dot, no
colored badge fill anywhere on this page). Outstanding-item state is
readable in text on every row ("Received — Under Review," "Not Yet
Submitted — action needed"), never conveyed by color or icon alone. No
fake clickable `<div>` anywhere. No focusable dead upload control — no
upload control of any kind exists (confirmed by source inspection, not
merely "disabled"). Every link has a meaningful accessible name
("Review your organisation profile," never "Click here" or a bare
icon). Mobile reading order matches DOM order (no `tabIndex` overrides
used anywhere on this page).

### 43.11 Backend projection/action gaps (for a future integration turn — not built this turn)

Derived directly from §43.1's capability map, verified by inspection,
not assumed:

1. **Client-facing KYC/KYB status projection** — a public, client-
   scoped read exposing `kyc_case.status` (and, per §43.2's own
   reasoning, deliberately NOT `cdd_outcome.outcome_status`/
   `outcome_reason`).
2. **Client-facing outstanding-information projection** — a public,
   client-scoped read exposing `checklist_item` rows (document type +
   status only — no internal verification-method or provider-score
   column, consistent with §43.6's restraint).
3. **Client document-submission/upload endpoint** — does not exist in
   any form today; a genuinely new capability, not merely new exposure
   of an existing internal route (no internal upload route was found
   either — document evidence appears to enter `KYC-01` through a
   different, unexplored intake path this turn did not need to trace
   further, since no client-facing exposure is being designed against
   it yet).
4. **Client-facing verification-area summary projection** — either a
   dedicated aggregate route, or client-side composition once gap #2
   above exists alongside the real `KYC_CASE_TYPES`/checklist
   structure (this page's own rollup logic, §43.1, already demonstrates
   what that composition would look like).
5. **Client-facing decision/outcome projection** — explicitly NOT
   requested as a literal `cdd_outcome` exposure (§43.2); if a future
   turn decides the client should see more decision detail than the
   coarse case status already provides, that is a new governance
   decision, not assumed here.

No Source-of-Funds/Source-of-Wealth or Business-Activity gap is listed
— neither has a field concept in the governed model to build a gap
statement against (§43.1), same category as `UI Phase 2G`'s own
Registered-Address non-gap.

---

## 44. UI Phase 2I — Staff/Operations Overview (`B`-classified Ops page)

**Status: IMPLEMENTED / VISUAL QA DEFERRED.** The first real page on
the Staff/Operations surface, replacing `UI Phase 2B`'s placeholder.
Same visual-QA posture as every client-page phase.

### 44.1 Capability map (verified against actual backend source, not assumed)

Every backend service's registered routes were re-scanned this turn —
unchanged from every prior UI phase's own findings, now independently
re-confirmed for the Ops surface specifically: `clt1`, `wlt1` (its
internal routes — the public 6-route contract is Client-only and not
relevant here), `iam2`, and `sec1` are ALL `requireInternal`-guarded.
**No route in any of the four is callable from a staff browser session
today.** Every concept below was traced to its exact source:

| Overview element | Owning module | Current internal route/model | Staff-facing (browser)? | Status |
|---|---|---|---|---|
| Client Requests | `CLT-01` | `/internal/clt1/applications` (**correction, UI Phase 2J: that path is `POST` create only — no list route exists at any layer; see §45.1**), `.../start-review`, `.../hold`, `.../reject`, `.../approve/{request,apply}` — real `client_application.status` enum (`routes/applications.ts`/`decisions.ts`: `draft`/`submitted`/`under_review`/`held`/`approved`/`rejected`/`cancelled`) | No | **PARTIAL/B** |
| Wallet Destination Review | `WLT-01` | `/internal/wlt1/wallet-destinations` (**correction, UI Phase 2K: `POST` registration, not a list — no list route exists; see §46.1**), `/internal/wlt1/destinations/:id/approve/{request,apply}`, `/internal/wlt1/stuck-screenings`, `/internal/wlt1/rescreening-runs` — real `wlt1.destination.status` enum, same as `UI Phase 2E`'s own; internal "safe staff" response (`lib/safe-response.ts`'s `safeWalletDestinationResponse`) masks the address IDENTICALLY to the public client response, verified this turn — staff do NOT get an unmasked view | No | **PARTIAL/B** |
| Maker-Checker Queue | `IAM-02` | `/iam2/approvals/request`, `/iam2/approvals/:id/{approve,reject}` — real `iam2.approval_request.status` enum (`routes/approvals.ts`: `pending`/`approved`/`rejected`/`expired`/`blocked`, the last set by an `iam2.sod_check` blocking a self-approval attempt — **correction, UI Phase 2L: `blocked` is set by a role/permission SoD *conflict*; a self-approval attempt leaves the request `pending`, and no list route exists — see §47.1/§47.4**) | No | **PARTIAL/B** |
| Recent Staff Activity (evidence) | `SEC-01` | `/internal/sec1/audit-events/{read,search}` — a real, confirmed-SAFE (already tier-redacted) field subset exists (`lib/read-redaction.ts`'s own `RedactableAuditEventRow`: `event_type`/`actor_type`/`entity_type`/`action`/`result`/`occurred_at_utc`, deliberately excluding hash-chain/integrity fields and raw payload at the SELECT level, not merely at response time) | No | **PARTIAL/B, minimal safe-field summary only** |
| Workflow Availability | N/A — presentation of `UI-04` §8's own nav IA | `components/shell/nav-data.ts`'s `OPS_NAV` | N/A (UI-internal) | Shown as-is — the 4 other `B`-classified Ops nav items, all "Interface planned" |
| Deposit/Withdrawal/Broking-RFQ Operations, Settlement, Reconciliation, Exceptions/Breaks | `DEP-01`/`WDR-01`/`TRD-01`/`LED-01`/`REC-01` | Not started at all (unchanged from `UI Phase 2A`'s own findings) | No | **OMITTED** — `C`-classified, module does not exist |
| Revenue / trading volume / settlement totals / fees / PnL | `LED-01` | Not started; no financial figure found in any of `CLT-01`/`WLT-01`/`IAM-02`/`SEC-01` either | No | **OMITTED** |

**This is the first UI phase to independently confirm the Staff/Ops
boundary finding `UI-04` §8 already predicted at the architecture
stage** — every single capability a staff browser might need is
internal-only, with zero exceptions, across all four modules inspected.

### 44.2 Route and page architecture

No new route — `/ops` already existed (`UI Phase 2B`); this turn
replaces its placeholder content. No nav change — `components/shell/
nav-data.ts`'s `OPS_NAV` is unmodified; "Operational Overview" already
had a real `href` since `UI Phase 2B`, and this turn's own explicit
instruction is to leave the other four Ops nav rows inert, which they
remain.

```
app/ops/page.tsx
components/ops/
  ops-data.ts               — CLT/WLT/IAM-02/SEC-01 state maps + demo fixtures + rollup derivation
  work-attention.tsx         — WorkRequiringAttention (rollup)
  operational-queues.tsx     — OperationalQueues (3 sub-queues)
  workflow-availability.tsx  — WorkflowAvailability + RecentActivity
```

### 44.3 Page header and demo disclosure

Title "Operational Overview," description "Review current operational
work queues, governed review items, and staff workflows requiring
attention." — no marketing language. `DemoDisclosure` (the shared
component, reused a fourth time): *"Interface preview — operational
summary data is demonstrative until the required staff aggregation
routes are implemented"* — same structural treatment, wording
consistent in style with every Client page's own disclosure.

### 44.4 Sections implemented

- **Work Requiring Attention** — a glanceable ROLLUP (count per queue),
  deliberately not a second copy of the itemised records shown in
  Operational Queues below it; counts derived directly from the same
  demo fixtures, so the two can never disagree. No KPI cards, no
  fabricated percentage/SLA countdown/severity level.
- **Operational Queues** — three real, governed queue concepts only
  (Client Requests / Wallet Destination Review / Maker-Checker Queue),
  each its own `<h3>` sub-group under the section's own `<h2>`
  (preserving logical heading hierarchy, this turn's own explicit
  requirement). `DENSE` row tier (32px, `h-8`) throughout, per this
  turn's "Ops should be denser than Client" direction and `UI-04`
  §35.14's own "high-volume operations" mapping. Hairline dividers, no
  zebra striping, state text never color-only (plain text, no `Badge`,
  no colored dot).
- **Workflow Availability** — the 4 OTHER `B`-classified Ops nav items
  (Operational Overview itself is omitted — linking to the page you are
  already on is pointless), all "Interface planned," none a real link —
  `UI Phase 2B`'s inert-nav convention preserved, not activated early.
- **Recent Staff Activity** — 2 demo evidence rows, safe-field subset
  only (§44.1). No drill-down, no sensitive detail, no actor identity.

**"System / Control Notes" (candidate section E) was evaluated and
OMITTED** — no operationally necessary static governance note was
identified that isn't already covered elsewhere in this project's own
governance documents; adding one here would be clutter, per this
turn's own default preference.

### 44.5 Internal → Ops-facing status mappings

Three separate mapping tables, one per module, since each has a
genuinely distinct real enum — never one generic "Pending" collapsing
different governed semantics:

**`CLT-01` (`client_application.status`)**

| Internal state | Ops label |
|---|---|
| `draft` | Draft |
| `submitted` | Submitted — Awaiting Review |
| `under_review` | Under Review |
| `held` | On Hold |
| `approved` | Approved |
| `rejected` | Rejected |
| `cancelled` | Cancelled |

**`WLT-01` (`wlt1.destination.status`) — reuses `UI Phase 2E`'s own
client-facing labels directly, a deliberate choice, not an oversight**
(documented rationale, §44.1: the internal safe-staff response masks
identically to the public client response, so the underlying fact and
its correct phrasing are identical; Ops additionally shows the owning
client reference, which the client's own page correctly omits as
redundant for a client viewing their own destination).

**`IAM-02` (`iam2.approval_request.status`)**

| Internal state | Ops label |
|---|---|
| `pending` | Pending Approval |
| `approved` | Approved |
| `rejected` | Rejected |
| `expired` | Expired |
| `blocked` | Blocked — Segregation of Duties |

### 44.6 Maker-Checker boundary

Each Maker-Checker Queue row shows only the action/subject/status — no
actor identity, no approve/reject control, no implication that the
same person could approve their own request. The two demo rows
deliberately reference the same two demo records already used in
Client Requests/Wallet Destination Review (`Wallet Destination
DEMO-WLT-002`, `Client Application DEMO-001` — **correction, UI
Phase 2J: the application subject is now `DEMO-002`, because `approve-request`
is only valid from `under_review`; see §45.3**) — architecturally
accurate, not coincidental: both `WLT-01`'s destination-approval flow
and `CLT-01`'s application-approval flow route through this exact
IAM-02 request/apply mechanism in the real system. No approve/reject
action exists anywhere on this page — that belongs to the future
dedicated Maker-Checker Queue page, explicitly not built this turn.

### 44.7 Sensitive-read / audit boundary

No audit detail drawer, no raw payload, no hash-chain/integrity field,
no actor identity (even a demo-shaped one) anywhere on this page — the
Recent Staff Activity section shows only the 6 confirmed-safe fields
(§44.1). Full audit detail is explicitly deferred to the future
dedicated Audit / Activity page.

### 44.8 Demo fixture scope

6 operational-queue records (2 per queue: Client Requests, Wallet
Destination Review, Maker-Checker Queue) plus 2 Recent Staff Activity
(**evidence rows superseded by UI Phase 2M, §48.7**)
evidence rows — obviously fictitious references (`Client Application
DEMO-001`/`DEMO-002`, `Wallet Destination DEMO-WLT-001`/`DEMO-002` — **superseded by UI Phase 2K,
see §46.4** —
`Approval Request DEMO-APR-001`/`DEMO-002`), no real IDs from the
repository, no real staff names anywhere.

### 44.9 C-classified and Exchange/financial boundaries confirmed

**No `C`-classified Ops capability appears anywhere, in any form** —
no disabled card, no teaser row, no "coming soon" mention for Deposit/
Withdrawal/Broking-RFQ Operations, Settlement, Reconciliation, or
Exceptions/Breaks; confirmed absent by source inspection of every new
file. **No trading terminal, order book, market data, Exchange
operation, or price chart anywhere.** **No balance, settlement amount,
trading volume, fee total, revenue, or PnL figure anywhere** — none
exists in any of the four modules inspected this turn (§44.1),
confirmed absent, not merely unused.

### 44.10 Layout and responsive behavior — structural reasoning (not rendered)

Asymmetric `xl:grid-cols-[1fr_320px]` layout at `≥1280px` (primary:
Work Requiring Attention + Operational Queues; secondary: Workflow
Availability + Recent Staff Activity) — the same split breakpoint and
"split only where the shell's own sidebar also engages" rationale every
client-page phase already established, reused rather than re-derived.
Below `xl:`: single column, stacked — order: PageHeader →
DemoDisclosure → Work Requiring Attention → Operational Queues →
Workflow Availability → Recent Staff Activity (optional safe evidence
summary), matching this turn's own required mobile priority order
exactly. No table is used anywhere on this page (the operational
queues are plain lists, not a `Table` primitive), so no
horizontal-scroll/overflow question applies — a deliberate choice given
each queue's own row content (a reference plus one status label) never
needs more columns than a list comfortably provides at any width
tested in this reasoning pass.

### 44.11 Accessibility

One semantic `<h1>` ("Operational Overview"). Two heading tiers used
correctly: `<h2>` per top-level section, `<h3>` per queue sub-group
within Operational Queues — preserving logical hierarchy rather than
three unlabelled lists under one heading. Status never color-only
(plain text throughout, no colored dot or badge fill anywhere on this
page). No clickable non-semantic `<div>` — every row is plain, non-
interactive `<li>`/`<span>` content; the only interactive elements on
the page are the shell's own nav (unchanged). No focusable dead control
of any kind. Timestamps in Recent Staff Activity use a consistent,
locale-aware format (`formatOccurredAt`, shared with no other page —
first use of a date+time format on this platform, distinct from the
date-only `formatRegisteredDate` `UI Phase 2E` established, since audit
evidence timestamps are meaningfully time-of-day-relevant in a way
"date registered" is not). Mobile reading order matches DOM order (no
`tabIndex` overrides anywhere on this page).

### 44.12 Shared components — none created cross-page this turn

`OpsQueueSummary`/`AttentionQueue`/`WorkflowAvailability`-as-a-generic-
wrapper were all considered and NOT created as reusable abstractions —
this is the FIRST Ops page; no second page yet exists to prove genuine
repetition (`UI-01` §2.1 rule 9's own "measurable consistency across
multiple call sites" bar is not met by one page). The three within-page
components built (`WorkRequiringAttention`, `OperationalQueues`,
`WorkflowAvailability`/`RecentActivity`) are narrow, page-specific, and
named by role — consistent with every prior phase's own restraint.

### 44.13 Backend projection gaps (for a future integration turn — not built this turn)

Derived directly from §44.1's capability map:

1. **Cross-module staff work-aggregation projection** — a genuinely new
   capability: no single existing route aggregates across `CLT-01`/
   `WLT-01`/`IAM-02` today; Work Requiring Attention's own rollup would
   need either a dedicated aggregate route or client-side composition
   of gaps #2–#4 below.
2. **CLT-01 staff-facing pending-application-summary projection** — (no
   list route exists at any layer today, §45.1) a
   staff-scoped (not client-scoped) read exposing `client_application`
   rows in `submitted`/`under_review`/`held` state.
3. **WLT-01 staff-facing review-queue projection** — a staff-scoped read
   exposing destinations in `pending_screening`/`pending_review` state,
   reusing the existing internal `safeWalletDestinationResponse` shape
   (already correctly masked — no new masking design needed, only new
   staff-session-authenticated exposure).
4. **IAM-02 staff-facing maker-checker-queue projection** — a staff-
   scoped read exposing `approval_request` rows in `pending` state
   (action/resource/status only, per §44.6's own no-actor-identity
   restraint carried into the gap statement itself).
5. **SEC-01 staff-facing safe-activity-summary projection** — the data
   SHAPE already exists and is already safe (`lib/read-redaction.ts`);
   the gap is exposing it through a staff-session-authenticated route,
   not redesigning what "safe" means. (**UI Phase 2M, §48.1/§48.11: the read
   route exists, but no role holds its permission and no relay carries module
   events into SEC-01 — the gap is larger than exposure alone.**)

No system-health/control-notes projection gap is listed — that
candidate section was omitted by design (§44.4), not because a gap
exists to fill later.

## 45. UI Phase 2J — Staff/Operations Client Requests (`B`-classified Ops page)

**Status: IMPLEMENTED / VISUAL QA DEFERRED.** The second real page on
the Staff/Operations surface and the first List + Detail workspace on
it (`UI Phase 2E` built the first anywhere). Same visual-QA posture as
every phase since `UI Phase 2E`.

### 45.1 Capability map (verified against `platform/services/clt1/src`, not assumed)

Every registered `clt1` route was enumerated this turn. **All are
`requireInternal`-guarded — none is callable from a staff browser
session.** Two findings sharpen the picture `UI Phase 2I` recorded:

- **There is no list route.** `GET` routes exist per-application
  (`/internal/clt1/applications/:application_id` and sub-resources) but
  nothing enumerates applications. `UI Phase 2I`'s §44.1 annotated
  `/internal/clt1/applications` as "(list)"; that path is `POST` create
  only. Corrected in place and in §45.3. A queue page therefore needs a
  route that does not exist at the internal layer either.
- **`safeApplicationResponse` excludes `legal_name`,
  `registration_number`, `country_of_incorporation` and
  `applicant_email`** (approved Phase 1 PII decision — the function's own
  header says so). It is the single choke point every route response
  passes through.

| UI element | CLT-01 model / route | Staff-facing (browser)? | Status |
|---|---|---|---|
| Request queue (list) | No list route exists (internal or otherwise) | No | **PARTIAL/B** — model real, no read route |
| Application reference | `client_application.application_id` (`clt1app_<uuid>`) — in safe response | No | **PARTIAL/B** |
| Status | `client_application.status` — in safe response | No | **PARTIAL/B** |
| Client class | `client_class_claimed` (`CLIENT_CLASSES`) + `client_class_status` (always `claimed` today) — in safe response | No | **PARTIAL/B** |
| Timestamps | `created_at_utc`, `submitted_at_utc`, `under_review_at_utc`, `updated_at_utc`, `held_at_utc`, `approved_at_utc`, `rejected_at_utc`, `cancelled_at_utc` — all in safe response | No | **PARTIAL/B** |
| Organisation name | `legal_name` column exists; **excluded from the safe response** | No | **DEMO-ONLY as shown** — see §45.10 |
| Applicant type | `applicant_type` (`APPLICANT_TYPES`) — in safe response | No | **PARTIAL/B** |
| Authorised-party summary | `GET /internal/clt1/applications/:id/authorised-parties` — `party_type` only shown; `party_reference` excluded by `safeAuthorisedPartyResponse` | No | **PARTIAL/B** (role counts only) |
| Reviewer assigned | `assigned_reviewer` (a staff user id) — in safe response | No | **PARTIAL/B**, shown as boolean only |
| Decision reason | `hold_reason` / `rejection_reason` — in safe response, populated from an optional `reason_code` (≤64 chars) | No | **PARTIAL/B** — never given a demo value |
| Client record / approval reference | `client_id`, `approval_id` — set only by `approve/apply` | No | **PARTIAL/B** (approved rows only) |
| Start review | `POST .../start-review` — IAM-02 baseline permission `clt1.application.review`, `submitted` → `under_review`, sets `assigned_reviewer` | No | **PARTIAL/B**, disabled placeholder |
| Hold / Reject | `POST .../hold`, `.../reject` — **single-step**, IAM-02 baseline permission, `under_review` only | No | **PARTIAL/B**, disabled placeholder |
| Request approval | `POST .../approve/request` (maker) → IAM-02 approval by a different actor → `POST .../approve/apply` | No | **PARTIAL/B**, disabled placeholder (maker step only) |
| Cancel | `POST .../cancel` — internal-identity guard only, `draft`/`submitted` | No | **PARTIAL/B**, disabled placeholder |
| Resume / un-hold | **No such transition exists** — `held` appears in no action's allowed-status list | — | **OMITTED** |
| CDD / AML / PEP / risk-rating rollup | `cdd_outcome_status`, `aml_sanctions_status`, `pep_adverse_media_status`, `risk_rating_status` — in safe response | No | **OMITTED by decision**, §45.6 |
| Registration no. / country / applicant email | Columns exist; excluded from safe response | No | **OMITTED** |
| SLA, priority, risk score | No such field in the model | — | **OMITTED** |

### 45.2 Route, navigation and page architecture

New route `/ops/client-requests`. `nav-data.ts`'s `OPS_NAV` "Client
Requests" gains its `href` (label unchanged); the other three inert rows
are untouched. The Overview's Workflow Availability row for Client
Requests now reads "Available" and links, following `UI Phase 2H`'s
precedent of promoting an Overview reference when its page lands; its
Client Requests queue group gains a "View all" link.

```
app/ops/client-requests/page.tsx           — header + disclosure + workspace (Server Component)
components/ops/
  client-request-data.ts                   — single source of truth (enum, labels, fixtures, actions map)
  client-request-status.tsx                — RequestStatusLine (icon + governed label)
  client-request-table.tsx                 — table (≥768px) / compact list (<768px)
  client-request-detail.tsx                — detail content (panel + Sheet share it)
  client-requests-workspace.tsx            — filter, selection, panel/Sheet composition
lib/use-is-lg-up.ts                        — useIsLgUp, extracted from Phase 2E
```

Page header: "Client Requests" / "Review client applications and their
current operational review state." `DemoDisclosure`: "Interface preview —
client request records are demonstrative until the staff-facing CLT
projection and action routes are integrated."

### 45.3 Shared data, Phase 2I consistency, and corrections to Phase 2I

`client-request-data.ts` is the one source for the application enum,
labels, demo records and "awaiting staff action" set; `ops-data.ts` now
imports it, so `/ops` and `/ops/client-requests` cannot disagree.
Verified in rendered HTML: the Overview shows **Client Requests — 2
items**, listing `DEMO-001` (Submitted — Awaiting Review) and `DEMO-002`
(Under Review); the queue page shows the same two as its first two rows,
in the same states, with the same labels.

Building the second page exposed three problems in `UI Phase 2I`'s demo
data and prose, corrected here rather than carried forward:

1. **List route.** §44.1 called `/internal/clt1/applications` a list; it
   is create-only (§45.1).
2. **Approval subject.** The demo `clt1.application.approve` request
   pointed at `DEMO-001`, an application still `submitted`.
   `approve-request` is only allowed from `under_review`
   (`lib/applications.ts`), so the real system would refuse it. It now
   targets `DEMO-002`, which is `under_review`.
3. **Wallet ownership.** The Wallet Destination Review rows named
   "Client Application DEMO-00x" as owner. A wallet destination belongs to
   a `client_id`, and a `client_profile` exists only after approval — an
   application under review has none. Both rows now reference
   `Client DEMO-CLI-001`, the client of approved demo application
   `DEMO-004`.

**"Requires attention" refined.** `UI Phase 2I` counted `held` as open.
The backend has no resume/un-hold transition (every action's
allowed-status list omits `held`; the source comment states it), so a held
application has no staff action to await. "Awaiting staff action" is now
`submitted` + `under_review` — which leaves the Overview's count and
listed records exactly as they were (2 items). Revisit if a resume
transition is ever added.

### 45.4 Demo fixtures

4 obviously fictitious records, one per lifecycle stage a queue reviewer
meets: `DEMO-001` Illustrative Treasury Services Ltd. (`submitted`,
institutional), `DEMO-002` Demo Capital Partners Ltd. (`under_review`,
professional), `DEMO-003` Sample Family Office Ltd. (`held`, HNWI),
`DEMO-004` Example Institutional Holdings Ltd. (`approved`,
institutional; client `DEMO-CLI-001`, approval `DEMO-APR-003`;
**names of `DEMO-001`/`DEMO-004` swapped in UI Phase 2K, §46.4**). No
real client name or repository id. Only `institutional`/`hnwi`/
`professional` are used: `retail` and `unknown` map to CFG-01's
permanently blocked `onboarding.retail_default` gate
(`lib/cfg1-client.ts`), so such an application cannot exist beyond
creation — a demo row for either would depict an impossible state. No
`rejected`/`cancelled`/`draft` demo row (this turn: "do not overload the
screen with negative scenarios"); all three are fully supported by the
mapping and the detail component.

### 45.5 Queue: columns, density, status mapping, filter/search

**Columns** (only fields the model backs): Application, Organisation,
Client Class, Status, Submitted, Last Updated. No Action column — the
Application cell holds the selection button, and a second control per row
would add a redundant tab stop. No SLA/priority/risk column.

**Density:** `COMPACT` 40px (`h-10`) — `UI-04` §35.14 names Client
Requests in the "standard lists" tier explicitly, and nothing here
suggests a high-volume queue.

**Status mapping** (`client_application.status` → Ops label), unchanged
from `UI Phase 2I` §44.5 — one label map for both pages, not two:

| Status | Label | Icon |
|---|---|---|
| `draft` | Draft | Circle |
| `submitted` | Submitted — Awaiting Review | Inbox |
| `under_review` | Under Review | Search |
| `held` | On Hold | CirclePause |
| `approved` | Approved | CircleCheck |
| `rejected` | Rejected | CircleX |
| `cancelled` | Cancelled | Ban |

`submitted`, `under_review` and `held` are never collapsed into a generic
"Pending" — they have different next actions. **Three further statuses
exist in the DB CHECK constraint** (`duplicate_review`, `pending_kyc`,
`pending_aml`) but no code path in `services/clt1/src` writes them (search
verified; the migration header calls them forward-compatibility values).
They are deliberately not modelled — dead vocabulary. If a later CLT phase
starts writing them, the enum and label map need extending.

**Client class** (`client_class_claimed`), exact governed vocabulary:
`institutional` → Institutional, `hnwi` → HNWI, `professional` →
Professional, `retail` → Retail, `unknown` → Unknown (the label map is
`UI Phase 2G`'s, reused). Shown as "Claimed by applicant" — `client_class_
status` never leaves `claimed` today (no verify route exists).

**Filter: implemented.** An operational queue mixes work awaiting action
with finished history and staff must isolate the former. A labelled
`Select` ("Status"); options are **derived from the governed label map**
(All + all 7 statuses), so a status cannot be missing or worded
differently. A polite live region reports "Showing N of M requests".
**Search: not added** — no free-text search capability exists in CLT-01,
and with a handful of records it would be decoration.

### 45.6 Detail panel, KYC/AML boundary, PII

Sections, each only where the model backs it: **Request Summary**
(created / submitted / last updated), **Organisation** (legal name,
applicant type, authorised-party role counts), **Classification** (class,
basis), **Review State** (status, reviewer assigned yes/no, review-started
timestamp), **Decision** (only for `held`/`approved`/`rejected`/
`cancelled`), **Review Actions**. Timestamps render in UTC with an
explicit "UTC" suffix — the source columns are `*_utc`, and pinning the
zone also prevents a server/browser hydration mismatch.

**Application is kept distinct from client.** Nothing implies a client
profile exists; only an approved request shows the `client_id` it
produced.

**KYC/AML boundary — omitted.** The safe response does carry
`cdd_outcome_status`, `aml_sanctions_status`, `pep_adverse_media_status`
and `risk_rating_status`, so "safe summary fields" technically exist. They
are compliance-portal domain (`UI-04` §9 puts Client Risk/KYC-KYB and
EDD/Review under Admin/Compliance), the brief's default is to omit, and
`UI Phase 2H` already decided the analogous outcome-level detail is not
shown outside the compliance surface. Recorded as a decision, not an
oversight; revisit if Ops is later given a scoped view.

**Sensitive PII — omitted:** registration number, country of
incorporation, applicant email, party names (`party_reference`), ownership
percentages, screening statuses, reviewer identity, wallet or bank detail.

### 45.7 Decision data

Real and read-only: `hold_reason`/`rejection_reason`, the corresponding
`*_at_utc`, `approval_id`, `client_id`. **The reason fields hold a short
optional `reason_code`, not free-text notes** (`RejectHoldBody`,
`maxLength: 64`) and have no governed vocabulary — so any demo value would
be invented. The held fixture therefore has none and renders "Not
recorded", which is both honest and a true depiction of an optional field.

### 45.8 Actions, review mode and the maker-checker boundary

**No mutation exists on this page.** No fetch, server action, auth or
permission code. The Review Actions section lists exactly the transitions
`lib/applications.ts` defines for the current status — `submitted`: Start
review, Cancel application; `under_review`: Place on hold, Reject,
Request approval; `draft`: Cancel; all other statuses: "No staff action is
currently defined." Each is a natively `disabled` `Button` (not focusable),
under an explicit "staff action routes are not yet integrated" note.

**Maker-checker is preserved, not flattened.** There is no "Approve"
button. Approval is `approve/request` (maker) → an IAM-02 approval by a
*different* actor → `approve/apply`; CLT-01 also blocks
`requested_by === assigned_reviewer`. The maker-side control is labelled
"Request approval", with a note that approval is a separate step by a
different authorised approver. **`reject` and `hold` are single-step,
permission-gated actions — not maker-checker** (`routes/decisions.ts`
header), and the wording never claims otherwise. The brief's "Resume" has no
backend counterpart and is not shown.

**Review mode:** the brief allowed a UI-only Review Request
dialog "if useful". It was assessed and **not built** — a Dialog stacked on
the persistent panel (or on the Sheet) would duplicate content already
shown. The detail panel/Sheet is the review surface; opening a request is
the "Open Review" action.

**Held, rejected, cancelled:** each has its own status icon and label and
its own Decision rows; `held` is visibly distinct from `under_review`
(different icon and label) and shows a reason only when one is recorded.

**Audit:** no timeline. The Decision section shows only the state's own
timestamp; the full trail belongs to the future Audit / Activity page.

### 45.9 C-classified and Exchange boundaries

No Deposit/Withdrawal/Broking-RFQ Operations, Settlement,
Reconciliation or Exceptions/Breaks element, teaser or mention. No
trading, order-book, market-data or price element; no balance,
settlement, fee, volume, revenue or PnL figure — none exists in CLT-01.

### 45.10 Backend gaps for a live Client Requests page

Inspected first; not all are missing.

| Need | Exists? | Gap |
|---|---|---|
| Staff-facing **list** projection | **No** — no list route at any layer | New route: enumerate `client_application` by status (paged), through a staff-session-authenticated path |
| Staff-facing **detail** projection | **Partly** — `GET /internal/clt1/applications/:id` returns `safeApplicationResponse`; `.../authorised-parties` returns role/status rows | Staff-session exposure only; but see next row |
| **Organisation name** | Column exists; **excluded by the approved PII decision** | A governance decision: expose `legal_name` (and only for corporate/institutional applicants — for `individual` it is a natural person's name) in a staff projection, or identify queue rows by `application_id` alone. The demo assumes the former |
| **Review actions** (start-review, hold, reject, cancel) | **Yes** — internal routes, IAM-02-gated (cancel: internal-identity only) | Staff-session-authenticated exposure; browser-safe actor binding (bodies carry `reviewer_id`/`actor_id`/`created_by`) |
| **Decision submission** (approve) | **Yes** — `approve/request` and `approve/apply` | Same exposure; the operator-created IAM-02 approval between the two steps has no UI path |
| **Maker-checker handoff** | **Yes** — IAM-02 `/iam2/approvals/*` | Staff exposure; CLT-01 cannot learn the approver's identity (documented, accepted limitation), so the UI cannot show "approved by" |
| Resume from `held` | **No** transition exists | Backend lifecycle decision before any "Resume" UI |

### 45.11 Responsive reasoning (structural, not rendered)

Shell facts: sidebar 240px from `xl:` (1280px); content padding `px-4`
/`sm:px-6`/`xl:px-8`. Content width ≈ viewport − 48px below 1280px, and ≈
viewport − 241px − 64px from 1280px.

| Viewport | Content | Layout | Table region | Columns |
|---|---|---|---|---|
| **1440** | ≈1135px | Split: queue + 320px panel, gap 32px | ≈783px | Application, Organisation, **Client Class**, Status, Submitted (Last Updated hidden) |
| **1280** | ≈975px | Split | ≈623px | 4 base columns (~600px estimated) |
| **1024** | ≈976px | Split (`lg:`) | ≈624px | Same as 1280 |
| **768** | ≈720px | Queue full width; detail in Sheet | 720px | 4 base columns |
| **430** | ≈398px | Compact list; detail in Sheet | — | Organisation / reference · class / state / date |

- **1280 vs 1024 are the same numbers by geometry**, not by accident: the
  sidebar's 241px arrives exactly as the viewport gains 256px. So the
  brief's `≥1280` persistent-panel requirement and its `1024–1279` "if
  safe" case resolve identically — the split is as safe in one as the
  other, and the persistent panel is used from `lg:` (1024).
- Columns respond to a **container query** on the table region, not the
  viewport, because the region's width depends on whether the panel is
  beside it: Client Class shows at ≥48rem (`@3xl`), Last Updated at ≥56rem
  (`@4xl`). Organisation truncates at `max-w-52` (208px).
- Below 768px a 6-column table would be horizontal-scroll-only, so the
  page uses a deliberate list with separators (no card spam); each row is a
  full-width button (≥44px tall).
- Below `lg:` the panel is hidden and selection opens a right `Sheet`;
  `useIsLgUp` (a real `matchMedia` subscription) prevents the Sheet opening
  over an already-visible panel.

**Visual risks carried into the consolidated pass** (none verifiable
without rendering): (1) the 4-column fit at ~623px rests on estimated text
widths (≈4% slack); (2) `max-width` + `truncate` on a `<td>` under auto
table layout — widely supported, worth one glance; (3) first use of
container queries on the platform; (4) on first paint the panel already
shows the first request but the row highlight appears only after
hydration (the `matchMedia` snapshot is `false` on the server, the same
behaviour as `UI Phase 2E`); (5) the `border-l-2` selected-row marker
(§35.15) is implemented here for the first time.

### 45.12 Accessibility

One `<h1>`. Detail: `<h2>` organisation (panel) or the Sheet's own
`SheetTitle`, `<h3>` per section. The table is a real `<table>` with an
accessible name; each row has exactly one tab stop — a real `<button>` in
the Application cell (`aria-current` marks the open request; its
accessible name "Open Client Application DEMO-001" contains the visible
text). The row's `onClick` is a mouse-only hit-area convenience; it adds no
role or tab stop and the button has no `onClick` of its own, so keyboard
and mouse paths do not double-fire. The filter has a real `<label>`; the
count is an `aria-live="polite"` region. Status is icon + text, never
colour alone. No fake mutation is focusable — every action button is
natively `disabled`, and the reason is stated in adjacent text. `Sheet` is
Radix (focus trap, Escape, focus return). Empty states: filter yielding
nothing → "No client requests match the current view." with a "Show all
requests" button; a genuinely empty queue → "No client requests are
currently awaiting review." (reachable in code, not rendered today).
Loading/error states are not built — nothing is fetched.

### 45.13 Shared-module decisions

- **`client-request-data.ts` — created:** two Ops pages now show the same
  records (the brief's suggested shared fixture).
- **`lib/use-is-lg-up.ts` — extracted** from `UI Phase 2E`, whose
  workspace now imports it: a second caller made ~20 lines of
  lint-sensitive code a genuine duplicate. Behaviour unchanged.
- **Not extracted:** the label/value `Row` and section helpers. They now
  recur in five files, but as slightly different variants (`text-sm` vs
  `text-xs` labels, `<dl>` vs `<li>`); unifying them is a visual-consistency
  change best made during the consolidated QA pass, not slipped into a
  feature turn.

### 45.14 What this phase explicitly did not do

No API/auth/permission code; no mutation; no audit timeline; no
search; no separate review dialog; no C-classified or Exchange element; no
KYC/AML detail; no change to the public homepage, backend, packages or
lockfile.

## 46. UI Phase 2K — Staff/Operations Wallet Destination Review (`B`-classified Ops page)

**Status: IMPLEMENTED / VISUAL QA DEFERRED.** The third real page on the
Staff/Operations surface and its second List + Detail workspace
(`UI Phase 2J` built the first). Same visual-QA posture as every phase
since `UI Phase 2E`. Executed on `7c3c89c` (the shadcn-MCP tooling commit;
the brief named `ed1fa15` — the delta touches no `platform/` file).

### 46.1 Capability map (verified against `platform/services/wlt1/src`, not assumed)

Every registered `wlt1` route was enumerated. **All `/internal/wlt1/*`
routes are `requireInternal`-guarded** (interim shared-token identity —
`plugins/internal-identity.ts`); the six `/wlt1/*` public routes are the
Client contract `UI Phase 2E` already used and are not staff routes. Three
findings shape this page:

- **No list route exists at any layer.** `POST /internal/wlt1/wallet-
  destinations` and `POST .../payout-destinations` are *registration*, not
  reads (`UI Phase 2I`'s §44.1 listed the first without saying so).
  Internal reads are per-destination and require the owning `client_id`
  as a query parameter. The only list is `GET /internal/wlt1/stuck-
  screenings`.
- **The internal safe responses omit almost everything a reviewer
  needs.** `safeWalletDestinationResponse` / `safeFiatDestinationResponse`
  return identity, `client_id`, status, network/rail fields, the *masked*
  value, `created_at_utc` and three version counters. They contain **no**
  `cooling_off_until_utc`, screening outcome, proof-of-control state,
  `updated_at_utc` or revocation evidence (fiat additionally has
  `verification_status`).
- **The only proof-of-control read is not a summary.** `GET .../proof-of-
  control` returns the **full recovered address** (`verified_address`) and
  writes a `wlt1.sensitive_destination_read` audit event.

| UI element / action | WLT-01 route / model | Staff-visible? | Kind | Status |
|---|---|---|---|---|
| Destination list | none | — | read | **PARTIAL/B** — model real, no read route |
| Destination detail (masked) | `GET .../wallet-destinations/:id?client_id=`, `GET .../payout-destinations/:id?client_id=` | No (internal only) | read | **PARTIAL/B** |
| Client reference | `client_id` — in both internal safe responses | No | read | **PARTIAL/B** |
| Type / network / rail / masked value | safe responses | No | read | **PARTIAL/B** |
| Status | `wlt1.destination.status` (6 values) | No | read | **PARTIAL/B** |
| Registered | `created_at_utc` (only timestamp exposed) | No | read | **PARTIAL/B** |
| Fiat beneficiary verification | `verification_status` in the fiat safe response | No | read | **PARTIAL/B** |
| Screening outcome | `wallet_screening_result.risk_status` — no read route | — | read | **DEMO-ONLY** (coarse; `risk_score`, categories, exposure never shown) |
| Proof of control | only the address-disclosing sensitive GET above | — | read | **DEMO-ONLY** (coarse state); raw signature/challenge **OMITTED** |
| Cooling-off end / countdown | column exists (`migration 055`), in no safe projection | — | read | **OMITTED** — status label only |
| First-use state | evaluated inside `evaluate-use`; no read route | — | read | **OMITTED** |
| Limits / velocity / concentration | `lib/limits.ts`; no read route | — | read | **OMITTED** — no restriction flag either |
| Lifecycle history | `destination_revocation` evidence table etc.; no read route | — | read | **OMITTED** — no timeline fabricated |
| Recover stuck screening | `POST .../stuck-screenings/:id/recover` | No | mutation | **PARTIAL/B**, disabled placeholder |
| Request approval (maker) | `POST .../destinations/:id/approve/request` (read-only preflight) → IAM-02 approval → `.../approve/apply` | No | mutation | **PARTIAL/B**, disabled placeholder |
| Revoke | `POST .../destinations/:id/revoke` | No | mutation | **PARTIAL/B**, disabled placeholder |
| Reject a request | **none** | — | — | **OMITTED** |
| Reveal full value | **none as a staff feature** (§46.9) | — | read | **OMITTED** |
| Balances / ledger / custody / settlement | not owned by WLT-01 | — | — | **OMITTED** |

### 46.2 Route, navigation and page architecture

New route `/ops/wallet-destination-review`. `OPS_NAV` "Wallet Destination
Review" gains its `href` (label unchanged — the governed §8 IA name);
"Maker-Checker Queue" and "Audit / Activity" remain inert. The Overview's
Workflow Availability row now reads "Available" and links, and its queue
group gains a "View all" link (the `UI Phase 2H`/`2J` precedent).

```
app/ops/wallet-destination-review/page.tsx      — header + disclosure + workspace (Server Component)
components/ops/
  destination-review-data.ts                    — shared records, staff metadata, actions, readiness
  destination-review-table.tsx                  — table (≥768px) / compact list (<768px)
  destination-review-detail.tsx                 — staff detail (panel + Sheet share it)
  destination-review-workspace.tsx              — filter, selection, panel/Sheet composition
```

**Wording.** Title "Wallet Destination Review" (governed IA label,
preserved); description "Review governed wallet and payout destination
requests and their current control state." — verified that the internal
review covers **both** categories: `destination-approval` and `revoke` are
destination-agnostic and `payout-destinations` has its own `assess`. So
"payout" belongs in the description even though the nav label says
"Wallet". `DemoDisclosure`: "Interface preview — wallet destination review
records are demonstrative until the staff-facing WLT review routes are
integrated."

### 46.3 Destination categories

Exactly the two WLT-01 supports — `wallet` and `fiat_payout` — and no third
(re-confirmed against `dto.ts` and the `destination_type` handling). They
differ materially in review, and the UI preserves it: a wallet has proof of
control (when `unhosted`/`unknown`) and can be `pending_screening`; a fiat
payout has beneficiary verification and rail coverage, **never enters
`pending_screening`** (`draft → pending_review` directly via `assess`), and
has no proof of control.

### 46.4 Ownership model, shared data, and corrections

**A destination belongs to an approved client — never to an application**
(`UI Phase 2J`'s correction, preserved). Every record carries a `client_id`
reference (`DEMO-CLI-001` / `DEMO-CLI-002`); no record references a CLT
application.

**Shared base + staff-only metadata.** `destination-review-data.ts` takes
each record's `destination` **by reference** from the Client Portal's own
`DEMO_DESTINATIONS` — the same five objects — so both portals agree on
identity, type, masked value, network/rail and status. Everything staff-only
(client ref, screening outcome, proof-of-control state, beneficiary
verification, stuck age) lives in a separate `review` object the client
fixtures never see; nothing staff-only leaks into a client fixture. The sixth
record (`demo-dest-006`) is staff-only because it belongs to a second client
and therefore must not appear on the first client's page. `DEMO-CLI-002` is a
reference string only — no CLT demo application backs it.

Corrections and changes to earlier demo data, made here rather than carried
forward:

1. **Overview count 2 → 3.** `UI Phase 2I` counted `pending_screening` and
   `pending_review` as open. A healthy `pending_screening` is not awaiting
   staff (the platform runs screening itself). The Overview's Wallet
   Destination Review group now lists exactly the records the review page
   marks awaiting staff — 3 (`DEMO-WLT-002` stuck screening, `DEMO-PAY-001`,
   `DEMO-WLT-004`) — from the same source.
2. **Reference renumbering.** The two `UI Phase 2I` wallet references
   (`DEMO-WLT-001`/`002`) are superseded; references now follow creation
   order, and a payout uses `Payout Destination DEMO-PAY-00n` (the Overview
   previously called every destination a "Wallet Destination").
3. **Approval subject.** The demo `wlt1.destination.approve` request (**not a real action — WLT's is `wlt1.destination.approve_apply`; corrected in UI Phase 2L, §47.7**) now
   targets `DEMO-PAY-001`, a `pending_review` destination whose approval
   gates are all met — a request that could actually be raised.
4. **Cross-portal organisation.** `UI Phase 2J` named the *submitted*
   application `DEMO-001` "Example Institutional Holdings Ltd." — the same
   organisation the Client Portal shows as an `active_limited` client. Names
   were swapped: `DEMO-004` (approved → `DEMO-CLI-001`) is now that
   organisation; `DEMO-001` is "Illustrative Treasury Services Ltd.". The
   client who owns the demo wallet destinations is now one organisation
   across both portals.

### 46.5 Fixtures and reachable states

6 obviously fictitious records; masked values only, no address, account
number, IBAN, transaction hash or client name. Each is a reachable
combination:

| Ref | Type | Status | Notes |
|---|---|---|---|
| `DEMO-WLT-002` | wallet (Tron, unhosted) | `pending_screening` | Screening in progress 1 h 34 min — past the recovery threshold, so it appears in the stuck-screening list. Wallet only |
| `DEMO-PAY-001` | payout (MY) | `pending_review` | Screening clear, beneficiary verified — all gates met |
| `DEMO-WLT-004` | wallet (Ethereum, unhosted) | `pending_review` | Screening `review_required`, proof of control verified — reachable because *any* terminal screening result advances a wallet to `pending_review` (`lib/screening-application.ts`), but only `clear` passes the approval gate |
| `DEMO-WLT-001` | wallet (Ethereum, hosted) | `active` | Hosted → no proof of control applies |
| `DEMO-PAY-002` | payout (SG) | `approved_pending_cooling` | Cooling end not staff-visible |
| `DEMO-WLT-003` | wallet (Ethereum, unknown) | `revoked` | Terminal |

No `draft` row (nothing for staff to see), no `high_risk`/`hit` row (same
mechanism as `review_required`; this turn asks not to overload negatives).
The filter includes every governed status, so `Draft` yields the empty state.

### 46.6 State-transition matrix (reachable transitions only)

| # | Source state | Staff action | Target | Route | Authority | UI representation |
|---|---|---|---|---|---|---|
| 1 | `draft` | *none — system* | `pending_screening` | `POST /internal/wlt1/wallet-destinations/:id/screen` (wallet; also resumes a stalled screening) | Internal token, `Idempotency-Key` | Status + explanatory note; no control |
| 2 | `pending_screening` | *none — system* | `pending_review` | Provider result applied — synchronously in `/screen`, or async via `POST /internal/wlt1/provider-results/receipt` (authenticated receipt). **Any** terminal outcome (`clear`/`review_required`/`high_risk`/`hit`) | Internal token / receipt auth | "Screening outcome" row |
| 3 | `draft` | *none — system* | `pending_review` | `POST /internal/wlt1/payout-destinations/:id/assess` (fiat: screening + beneficiary verification) | Internal token | Fiat never shows `pending_screening` |
| 4 | `pending_screening` | **Recover stuck screening** | `draft` (screening `pending → failed`) | `POST /internal/wlt1/stuck-screenings/:screening_result_id/recover` — `reason_code` ∈ `provider_result_never_delivered`/`provider_outage`/`operator_containment`; refused before the age threshold | Internal token only — **no IAM-02** | Disabled "Recover stuck screening", offered only when stuck |
| 5 | `pending_review` | **Request approval** (maker) | `approved_pending_cooling` | `POST .../destinations/:id/approve/request` (read-only preflight; IAM-02 `checkPermission` advisory) → IAM-02 approval created **outside WLT** by a different actor → `POST .../approve/apply` (decision token bound to the payload hash; sets `cooling_off_until_utc` and `whitelist_approval_ref`) | **Maker-checker via IAM-02** | Disabled "Request approval", offered only when every gate is met |
| 6 | `approved_pending_cooling` | *none — system* | `active` | Lazy promotion inside `POST .../destinations/:id/evaluate-use` on the first eligible use after cooling-off elapses | Internal token | Status note — **not a timer, not a staff action** |
| 7 | `draft`, `pending_screening`, `pending_review`, `approved_pending_cooling`, `active` | **Revoke destination** | `revoked` | `POST /internal/wlt1/destinations/:id/revoke` — `reason_code` ∈ `compromise`/`client_request`/`beneficiary_change`/`operator_security_action`/`administrative`, optional detail ≤280 | Internal token only — **no IAM-02, no maker-checker** (deliberate) | Disabled "Revoke destination" on every non-revoked record |
| 7a | (same states) | *none — system* | `revoked` | `POST /internal/wlt1/aml-revocations` (`aml_risk_signal`); rescreening run (`rescreen_adverse`) | Internal token | — |
| 8 | `revoked` | — | — | Absorbing; a second revoke is a no-op | — | "No staff action is available" |

**Not represented because unreachable:** a fiat `pending_screening`; any
"reject" transition; `revoked` → anything; `pending_review` → `draft`; any
staff-driven `approved_pending_cooling → active`.

**Approval gates** (`lib/destination-approval.ts`, evaluated at both
`approve/request` and `approve/apply`): status is `pending_review`; the
latest screening is `clear` **and unexpired**; a wallet of type `unhosted`
or `unknown` has verified proof of control (`hosted` does not); a fiat
destination has a supported rail, a verified and unexpired beneficiary
verification, and no proof of control.

### 46.7 Lifecycle mapping and "awaiting staff action"

Labels are `UI Phase 2E`'s `STATUS_LABELS`, reused directly (single source,
the `UI Phase 2I` precedent). Staff and client wording do not differ:
`pending_screening` "Screening in Progress", `pending_review` "Pending
Review", `approved_pending_cooling` "Approved — Cooling-Off". Staff get
extra semantics through a one-sentence **Control State** note per status,
not different labels.

**Awaiting staff action** is derived from the matrix, not "every non-active
state":

- `pending_review` — a decision is required (request approval, or revoke).
- `pending_screening` **only when stuck** — the platform runs screening; the
  sole staff action is recovery, which the route refuses before its
  threshold.
- **Not awaiting:** `draft` (platform initiates screening); a healthy
  `pending_screening`; `approved_pending_cooling` (no manual step — and
  because promotion is lazy, the status can outlast the cooling window until
  the first use is evaluated, so the status alone does not say cooling is
  still running); `active`; `revoked`. Revocation stays available from every
  non-revoked state, but availability is not a queue.

**Screening is both** an automated state and, when it stalls, a staff
state. No "Pass Screening" control exists: no route lets staff set a
screening outcome.

### 46.8 Queue, density, filter, search

**Columns** (only fields the safe responses back): Destination (masked),
Network / Rail, Status always; Registered, Type and Client as the table
region widens (container query: `≥42rem` / `≥48rem` / `≥56rem`). No
balance, amount, risk-score, settlement or SLA column. Awaiting-staff
records lead the queue, so the panel's default selection is one that
matters. **Density:** `COMPACT` 40px (`h-10`) — `UI-04` §35.14 names "Wallet
Destination Review" in the "standard lists" tier; nothing suggests a
high-volume queue.

**Filter: implemented** — a labelled `Select`, options derived from
`DESTINATION_STATUSES` and `STATUS_LABELS`, so it can never omit or reword a
status; a polite live region reports "Showing N of M destinations".
**Search: not added** — WLT-01 has no search capability and six records do
not justify one.

### 46.9 Detail panel and the controls WLT exposes

Sections (each only where backed): **Client Context**, **Destination
Details**, **Control State**, **Screening & Evidence** (non-revoked only),
**Review Actions**. Not the Client `DestinationDetail` — a client reviews
their own destination, staff decide; only the domain formatters and status
line are shared, never the layout. No version counters, hashes, internal
ids or provider names.

- **Wallet fields:** network, wallet type, relationship, memo/tag present.
  **Fiat fields:** country, currency, rail (governed code shown verbatim —
  no invented label), bank identifier, branch, beneficiary type.
- **Masking.** Only `address_masked` / `account_identifier_masked`, already
  masked by WLT-01. **No reveal control.**
- **Sensitive Read is not a reveal permission.** `lib/sensitive-read.ts`
  publishes a service-attributed audit event around the proof-of-control
  routes (its actor is `request.ctx.actor_id ?? "wlt1_internal_service"`,
  "never a fabricated human/staff id"). No route discloses a full address or
  account number to a staff role; a real reveal would need its own route,
  authority and evidence, so none is built or implied.
- **Proof of control.** Applies to wallets only (`unhosted`/`unknown`), is
  obtainable only while `pending_review`, and is a hard approval gate. The
  UI shows a coarse Verified / Not verified / Not applicable — **demo-
  projected**, since no summary projection exists. Raw signature, challenge
  and recovered address are never shown.
- **Cooling-off.** Label "Approved — Cooling-Off" plus the note in §46.7.
  **No end time, countdown or time-remaining** — `cooling_off_until_utc`
  is in no safe projection.
- **First-use, limits, velocity, concentration.** Evaluated only inside
  `evaluate-use` at use time; **no read route and no safe-response field**.
  Omitted entirely — not even a "restriction present" flag, since nothing
  backs one.
- **Client context.** A client reference only. No KYC file, risk score, AML
  case or UBO detail — those belong to Admin/Compliance.
- **History/audit.** Only `created_at_utc` is exposed; no state-transition
  timestamps or revocation evidence have a read route, so **no timeline is
  fabricated**. Full audit belongs to Audit / Activity.

### 46.10 Maker-checker, reject vs revoke

- **Approval is maker-checker.** `approve/request` is a read-only preflight
  that returns the canonical payload; an operator creates the IAM-02
  approval *outside WLT* (WLT "does NOT call `/iam2/approvals/request`");
  `approve/apply` requires a decision token bound to that payload hash. The
  UI therefore offers **"Request approval"**, never "Approve", and states
  that a different authorised approver completes it. One reviewer cannot
  complete both stages.
- **Revocation is deliberately *not* maker-checker** (route header:
  "unlike whitelist approval, this route has NO IAM-02 call and NO maker-
  checker — approval grants authority and requires a second approver;
  revocation REMOVES authority and must support immediate operator
  containment"). The panel says so: "immediate, single-step and
  irreversible". Recovering a stuck screening is likewise single-step.
- **Reject vs revoke: the backend has no reject.** Declining a request
  before activation is done by revoking it — the same `revoked` state,
  reachable from any non-revoked state, with an operator reason code. The UI
  therefore has **no "Reject" control and no "Rejected" state**; inventing
  one would misrepresent the model. The distinction that *does* exist is
  provenance: operator revoke vs system revoke (AML signal, rescreening).

### 46.11 Actions and the mutation boundary

**No mutation exists on this page** — no fetch, server action, auth or
permission code. Review Actions shows exactly the actions §46.6 defines for
the current status; every one is a natively `disabled` `Button` (not
focusable), under a "staff action routes are not yet integrated" note. The
verbs are the backend's own — **Recover**, **Request approval**,
**Revoke** — not "Verify", "Trust" or "Whitelisting Complete". "Request
approval" appears only when every approval gate is met, because the
backend refuses `approve/request` otherwise; a `pending_review` record with
unmet gates says so and offers revoke alone.

### 46.12 Backend gaps for a live review page

Inspected first; not all are missing.

| Need | Exists? | Gap |
|---|---|---|
| Staff **list** projection | **No** — no list route at any layer | New paged, status-filtered, cross-client route through a staff-session path |
| Staff **detail** projection | **Partly** — internal `GET` per destination with `client_id` query | Staff-session exposure; and it lacks the fields below |
| **Cooling** state/timestamp | Column exists; **in no safe projection** | Expose `cooling_off_until_utc`, or a derived "cooling elapsed" flag (needed because promotion is lazy) |
| **Screening result** summary | **No read route** | Coarse `risk_status` plus validity/freshness (approval requires an unexpired result) |
| **Proof-of-control** summary | Only a sensitive GET that returns the full address | A coarse-status projection with no address and no sensitive-read event |
| Beneficiary verification (fiat) | **Yes** — `verification_status` in the fiat safe response | Freshness (`valid_until`) is not exposed |
| **Review actions** | **Yes** — `recover`, `approve/request`+`apply`, `revoke` exist internally | Staff-session exposure; browser-safe actor binding (bodies carry `actor_id` and `client_id`); the request bodies need the record's `client_id` |
| **Maker-checker handoff** | IAM-02 approval is created outside WLT | No UI path; approver identity is not visible to WLT |
| **Lifecycle history** | Evidence exists (`destination_revocation`, screening rows, audit) | No read route; needs a safe summary or defers to Audit / Activity |
| **First-use / limits** | Evaluated at use time only | No read route; would need an explicit policy decision on what staff may see |
| **Controlled sensitive read** | Logging exists; **no staff reveal feature** | Its own route, authority, evidence and SEC-01 tie-in — none implied by this page |
| Reject transition | **None** | A backend lifecycle decision before any "Reject" UI |

### 46.13 Responsive reasoning (structural, not rendered)

Shell facts as `UI-04` §45.11: content width ≈ viewport − 48px below
1280px, ≈ viewport − 305px from 1280px (sidebar 240px + 1px border + 64px
padding).

| Viewport | Content | Layout | Table region | Columns |
|---|---|---|---|---|
| **1440** | ≈1135px | Split: queue + 320px panel, 32px gap | ≈783px | Destination, Network/Rail, Status, Registered, **Type** (Client hidden) |
| **1280** | ≈975px | Split | ≈623px | 3 base columns (~500px) |
| **1024** | ≈976px | Split (`lg:`) | ≈624px | Same as 1280 |
| **768** | ≈720px | Queue full width; detail in Sheet | 720px | 3 base + Registered (~600px) |
| **430** | ≈398px | Compact list; detail in Sheet | — | Identifier / date · client · type · network / state |

The persistent panel is used from `lg:` — `≥1280` and `1024–1279` resolve
identically (the sidebar's 241px arrives as the viewport gains 256px), so
the split is as safe in one as the other. Below `lg:` selection opens a
right `Sheet` via `useIsLgUp`. **Visual risks for the consolidated pass**
(none verifiable without rendering): (1) the 3-column fit at ~623px rests on
estimated text widths (~120px slack); (2) `text-sm` medium status text in a
40px row; (3) the row highlight appears only after hydration (the
`matchMedia` snapshot is `false` on the server); (4) `max-width`-free
`nowrap` cells rely on the container-query hiding, not truncation.

### 46.14 Accessibility

One `<h1>`. The panel is `<h2>` (masked identifier) with `<h3>` sections; in
the Sheet, `SheetTitle` carries the identifier. A real `<table>` with an
accessible name; one tab stop per row — a native `<button>` in the
Destination cell (`aria-current` marks the open record; its accessible name begins with the
visible masked identifier — "…, open Wallet Destination DEMO-WLT-002" — so
label-in-name holds; an earlier draft used a name that omitted the visible
text and was corrected before commit). The row `onClick` is a mouse-only hit-area
convenience; the button has no `onClick` of its own, so selection never
double-fires. A real `<label>` for the filter; an `aria-live="polite"`
count. Status is icon + text; approval gates are icon + text (Met / Not met /
Not applicable), never colour alone. **No fake mutation is focusable** —
every action button is natively `disabled`, with the reason stated in
adjacent text. Empty states: filter yielding nothing → "No wallet
destination reviews match the current view." with a "Show all destinations"
button; a genuinely empty queue → "No wallet destination requests currently
require review." (reachable in code; deliberately does not say destinations
are safe). Loading/error states are not built — nothing is fetched.

### 46.15 Shared components, shadcn and MCP

- **Created (page-specific, named by role):** `DestinationReviewTable`,
  `DestinationReviewDetail`, `DestinationReviewWorkspace`. No `Aix*`
  wrapper.
- **Reused:** `useIsLgUp`, `DemoDisclosure`, `PageHeader`, `DestinationStatusLine`
  and the formatters from `UI Phase 2E`, `formatRequestDate(Time)` from
  `UI Phase 2J` (UTC-pinned — a generic formatter living in a requests
  module; a rename is a cleanup candidate).
- **Not extracted:** a generic `ListDetailWorkspace`. This is now the third
  filter/panel/Sheet workspace (Wallet & Payout Destinations, Client
  Requests, this), so the repetition is real — but promoting it means
  editing two shipped pages during deferred QA. Recorded as a consolidation
  candidate alongside the `Row`/`Section` helpers (§45.13).
- **shadcn:** no component added, updated or regenerated. Existing `Table`,
  `Button`, `Sheet`, `Select` and `Label` sufficed, so the MCP policy stopped
  at step 2 (reuse an installed primitive); the official MCP was not needed.

### 46.16 Boundaries

**WLT-01 ownership:** no wallet balance, account balance, ledger,
settlement accounting, custody accounting or finality anywhere — WLT-01 owns
destination eligibility and control only. **No `C`-classified Ops element**
(Deposit/Withdrawal/Broking-RFQ Operations, Settlement, Reconciliation,
Exceptions/Breaks). **No Exchange element** — no trading, order book,
pricing or market data. Confirmed by source inspection and a forbidden-term
scan of the rendered page.

### 46.17 What this phase explicitly did not do

No API/auth/permission code; no mutation; no reveal; no timeline; no
search; no separate review dialog; no reject; no cooling countdown; no
first-use/limit display; no C-classified or Exchange element; no change to
the public homepage, backend, packages or lockfile.

## 47. UI Phase 2L — Staff/Operations Maker-Checker Queue (`B`-classified Ops page)

**Status: IMPLEMENTED / VISUAL QA DEFERRED.** The fourth real page on the
Staff/Operations surface and its third List + Detail workspace. Same
visual-QA posture as every phase since `UI Phase 2E`. Baseline `62066fd`,
as the brief stated.

### 47.1 Capability map (verified against `platform/services/iam2/src`, not assumed)

**Auth surface.** `IAM-02`'s three approval routes are guarded by its own
internal-service-token guard; the file header states "IAM-02 has no user-
session surface of its own this stage", so the acting user travels as a
request-body field (`maker_user_id` / `approver_user_id`). Nothing is
callable from a staff browser session. Three findings shape the page:

- **There is no list, get or search route.** `routes/approvals.ts`
  registers exactly `POST /iam2/approvals/request`, `POST .../:id/approve`
  and `POST .../:id/reject`. A queue page needs a read route that does not
  exist at any layer.
- **No approval policy is seeded, and the approver is never role-checked.**
  `approval_policy` rows appear in no migration or seed, so every request
  takes the route defaults (1 approval, no step-up, 24-hour expiry).
  `required_approver_roles` and `threshold_type` exist on the table but no
  code reads them, and `approve` performs no permission check on the
  approver — only "not the maker", "no segregation-of-duties conflict", and
  step-up when a policy demands it.
- **`IAM-02` records approvals; the originating module applies them.** On
  final approval it mints a single-use decision token (12-minute TTL) that
  the consumer redeems via `execute-verify`. "Approved" is therefore not
  "applied".

| UI element / action | IAM-02 route / model | Staff-visible (browser)? | Kind | Status |
|---|---|---|---|---|
| Queue (list) | none | — | read | **PARTIAL/B** — model real, no read route |
| Request detail | none (`approval_request` row) | No | read | **PARTIAL/B** |
| Action, resource, subject (`entity_id`), client (`client_id`) | `approval_request` columns | No | read | **PARTIAL/B** |
| Status | `approval_request.status` — 5 writable values (§47.4) | No | read | **PARTIAL/B** |
| Created / expires / completed | `created_at_utc`, `expires_at_utc`, `completed_at_utc` | No | read | **PARTIAL/B** |
| Approvals n of m | `approved_count`, `required_count` | No | read | **PARTIAL/B** |
| Requester | `maker_user_id` — an **opaque** IAM user id; no name held | No | read | **DEMO-ONLY as shown** (a generic role label marked "(demo)") |
| Decision reason | `approval_decision.decision_reason`, optional, ≤512 chars | No | read | **PARTIAL/B** — never given an invented value |
| Deciding user | `approval_decision.approver_user_id` — opaque | No | read | **OMITTED** |
| Approval policy / step-up | `approval_policy` — none seeded; default applies | No | read | **PARTIAL/B** (default shown) |
| Required approver role | `required_approver_roles` — stored, never read or enforced | — | read | **OMITTED** (§47.5) |
| Subject label ("Payout Destination DEMO-PAY-001") | none — `IAM-02` stores only `entity_id` | — | read | **DEMO-ONLY** (cross-module label projection) |
| Effect once applied | not in `IAM-02` — the consumer's own behaviour | — | read | **DEMO-ONLY**, from each module's source |
| Approve Request | `POST /iam2/approvals/:id/approve` | No | mutation | **PARTIAL/B**, disabled placeholder |
| Reject Request | `POST /iam2/approvals/:id/reject` | No | mutation | **PARTIAL/B**, disabled placeholder |
| Raise a request (maker step) | `POST /iam2/approvals/request` | No | mutation | **Not on this page** — done from the originating workflow |
| Payload, payload hash, decision token | `approval_request` / token store | — | read | **OMITTED** (sensitive) |
| SoD matched-rule ids | `sod_check.matched_rules` | — | read | **OMITTED** |
| Current-user eligibility | no session, no projection | — | read | **OMITTED** — stated in text only |
| Amount, priority, risk | none in the model | — | — | **OMITTED** |
| `cancelled` status | in the DB CHECK, **written by no code** | — | — | **OMITTED** |

### 47.2 Real request types represented

Each is the exact `(action, resource)` a consumer passes to
`verifyDecisionToken` (verified at the call sites; **22 call sites across 7
modules exist**). No invented type. Four are represented; the mapping is
data-driven, so another is one entry.

| Action | Resource | Module | Entity bound | Client bound | Originating page |
|---|---|---|---|---|---|
| `wlt1.destination.approve_apply` | `destination` | WLT-01 | destination id | Yes | `/ops/wallet-destination-review` |
| `clt1.application.approve` | `application` | CLT-01 | application id | **No** (an application is not yet a client) | `/ops/client-requests` |
| `clt1.client_mandate.update` | `client_mandate` | CLT-01 | mandate id | Yes | none yet — no link |
| `wlt1.evidence_export.apply` | `evidence_export` | WLT-01 | export id | Yes | none yet — no link |

Real but **not** represented, to keep scope: CLT authorised-party
add/update/remove/activate, related-party add/update/remove, authorised-user
add/remove, duplicate-candidate create/update/confirm/dismiss and mandate
create; KYC-01 `kyc1.outcome.override`; SEC-01 `sec1.security_alert.close`;
AML-01 screening-match decisions. CFG-01 uses its own decision-token library
rather than `IAM-02`'s. KYC/AML/SEC subjects were left out deliberately —
their subjects are compliance-portal domain.

### 47.3 Route and navigation

**`/ops/maker-checker-queue`.** The brief named `/ops/maker-checker` as the
default "unless the established convention clearly supports another".
The convention is unambiguous: `Client Requests` → `/ops/client-requests`,
`Wallet Destination Review` → `/ops/wallet-destination-review` — the slug of
the governed nav label. `Maker-Checker Queue` therefore maps to
`maker-checker-queue`; `/ops/maker-checker` would break a deterministic
mapping, and the next page (`Audit / Activity` → `/ops/audit-activity`)
inherits it. `OPS_NAV` "Maker-Checker Queue" gains its `href` (label
unchanged); only "Audit / Activity" remains inert. The Overview's Workflow
Availability row now reads "Available" and links, and its queue group gains
"View all".

```
app/ops/maker-checker-queue/page.tsx        — header + disclosure + workspace (Server Component)
components/ops/
  approval-request-data.ts                  — shared: statuses, types, policy default, fixtures
  approval-request-status.tsx               — ApprovalStatusLine (icon + governed label)
  approval-request-table.tsx                — table (≥768px) / compact list (<768px)
  approval-request-detail.tsx               — detail (panel + Sheet share it)
  approval-requests-workspace.tsx           — filter, selection, panel/Sheet composition
```

Header "Maker-Checker Queue" / "Review approval requests that require
independent authorization under AIX maker-checker controls." `DemoDisclosure`:
"Interface preview — approval requests are demonstrative until the staff-
facing IAM-02 queue and decision routes are integrated."

### 47.4 Status mapping and what each really means

| `approval_request.status` | Ops label | How it arises (from code) |
|---|---|---|
| `pending` | Pending Approval | Created by `request`; `approved_count < required_count` |
| `approved` | Approved | `approved_count ≥ required_count`; `completed_at_utc` set; token minted if a payload hash exists |
| `rejected` | Rejected | **One** reject by any approver on a pending, unexpired request; `completed_at_utc` set |
| `expired` | Expired | Written **lazily** — only when an approve/reject is attempted after `expires_at_utc`; no sweeper, so a past-expiry request can still read `pending` |
| `blocked` | Blocked — Segregation of Duties | An approve attempt found a role/permission SoD **conflict**; the request itself becomes terminal |

Labels are `UI Phase 2I`'s (single source, now moved into
`approval-request-data.ts`). `cancelled` (in the DB CHECK, written by no
code) is not modelled. **`blocked` is not `rejected`, and is not the
self-approval refusal** — approver === maker returns
`IAM2_SELF_APPROVAL_BLOCKED` and leaves the request `pending`. `UI Phase 2I`'s
§44.1 said `blocked` was set "by an `iam2.sod_check` blocking a self-approval
attempt"; that was wrong and is corrected in place. **Awaiting a checker =
`pending` only.** Approved, rejected, expired and blocked are terminal: every
further decision returns `IAM2_APPROVAL_ALREADY_DECIDED`.

### 47.5 Maker-checker and segregation of duties

What `IAM-02` actually enforces, by decision:

| Rule | `approve` | `reject` |
|---|---|---|
| Request must be `pending` and unexpired | Yes | Yes |
| Approver ≠ maker (`IAM2_SELF_APPROVAL_BLOCKED`, audited) | **Yes** | **No** |
| No SoD conflict between maker and approver grants → else request `blocked` | **Yes** | **No** |
| Step-up assertion when the policy requires it | Yes | No |
| One decision per approver | Yes | Yes |
| Approver holds a role / permission | **No** | **No** |

The panel states independence in text beside the controls — "Approve Request
must come from a different user than the requester, with no segregation-of-
duties conflict between them. The requester cannot approve their own
request. **Reject Request is not subject to that check.**" — because the
asymmetry is real and hiding it would imply a control that does not exist.
The brief's warning not to infer identical SoD rules across workflows is
honoured the other way too: `IAM-02`'s rules are uniform across request
types; per-workflow differences come only from optional policy rows, and
none exist.

**Deviation from `UI-04` §22, recorded.** §22 asks the UI to show the
"required approver role". `IAM-02` stores `required_approver_roles` but never
reads it, and `approve` checks no role — so a role would be a control that is
not enforced. The panel shows the enforced rule instead. **Observation for
governance** (not a UI matter): under the current code any user id that is
not the maker and has no SoD conflict may approve; approver authorisation is
not enforced. The only seeded SoD rule is the meta-rule (`iam2.sod.manage` vs
`iam2.role.assign_user` / `iam2.permission.assign_role`), so `blocked` is
reachable only for makers/approvers holding those permissions — the demo row
is a reachable-in-principle illustration, not a common case.

### 47.6 Detail panel, evidence and omissions

Sections, each only where backed: **Request Summary** (action, created,
expires), **Originating Workflow** (module, workflow — a link only where a
real page exists — subject, client), **Requested By**, **Approval
Requirement** (n of m, default policy, step-up, expiry window, and the
independence text), **Decision State** (status, its meaning, and the effect
once applied), **Decision History** (an ordered, request-specific list:
Requested → Approved/Rejected, or Expired; plus the reason), **Checker
Action**. This satisfies §22: initiator always shown; status is a real one;
the rejection reason row is always shown for a decided request ("No reason
recorded" — never invented, never hidden); the effective state is stated
("the destination moves to Approved — Cooling-Off"); and "pending" says it is
waiting on someone else.

- **Requester identity.** `maker_user_id` is an opaque id; no name exists.
  The fixtures show "Operations Maker (demo)" / "Compliance Maker (demo)",
  and the panel says the label is demonstrative. No personal name anywhere.
- **Deciding user** is not shown — opaque, and no display projection exists.
- **Blocked** shows no reason: only matched-rule ids are stored, and they
  are omitted. **Expired** shows its expiry time, no countdown.
- **History is only what `IAM-02` stores** — `approval_request` and
  `approval_decision`. No SEC-01 audit record is duplicated; a blocked
  request has no timestamp of its own, so none is shown.
- **Never shown:** payload, payload hash, decision token, SoD rule ids,
  any WLT/CLT sensitive value (only the originating pages' own reference
  labels), any KYC/AML/SEC internals, any financial figure.

### 47.7 Demo fixtures and cross-page consistency

6 obviously fictitious requests, one per status except `rejected` (fully
supported by the mapping and detail, no fixture — the brief asks for 4–6 and
not to overload negatives): `DEMO-APR-001` (pending, WLT payout
`DEMO-PAY-001`), `-002` (pending, CLT application `DEMO-002`), `-003`
(approved, CLT application `DEMO-004`), `-004` (approved, WLT payout
`DEMO-PAY-002`), `-005` (expired, evidence export), `-006` (blocked, mandate
update). A slice of the queue, not the register. All use the default policy.

**One source of truth** — `approval-request-data.ts` — feeds this page, the
Overview, Wallet Destination Review and Client Requests, and its subject
labels come from those pages' own data modules. Consequences, all verified in
rendered output:

- The Overview's "Maker-Checker Queue — 2 items" and this page's default view
  are the same two requests; the count is unchanged from `UI Phase 2I`.
- **Wallet Destination Review and Client Requests no longer contradict the
  queue.** `DEMO-PAY-001` and `DEMO-002` used to offer "Request approval"
  while this queue shows a request already pending for each. Their detail
  panels now say "Approval requested — Approval Request DEMO-APR-00n is
  awaiting an independent approver" with a link, and drop the redundant
  action. Records with no pending request (`DEMO-001`, `DEMO-WLT-004`) are
  unchanged. This is a UI-level projection: WLT-01 and CLT-01 do not record
  which approval is pending, so a live version needs a cross-module lookup
  (§47.11).
- `DEMO-APR-003` is the approval `client-request-data.ts` already recorded for
  approved application `DEMO-004`; `DEMO-APR-004` is the approval behind payout
  `DEMO-PAY-002`'s cooling-off status.

**Correction to `UI Phase 2I`/`2K`.** Both showed the WLT action as
`wlt1.destination.approve`. That is not a real action: WLT verifies
`wlt1.destination.approve_apply` (`routes/destination-approval.ts`; the
preflight is `approve_request`). Fixed in the Overview and in this page; the
CLT string `clt1.application.approve` was already correct.

### 47.8 Actions, reason and the mutation boundary

**No mutation exists on this page** — no fetch, server action, auth or
permission code, and no local fake success: the fixtures are read-only and
nothing ever changes a request's status. Only a `pending` request offers
actions: **Approve Request** and **Reject Request** — the routes' own verbs,
as the brief specified — each a natively `disabled` `Button` (not focusable),
under a "decision routes are not yet integrated" note. Terminal requests show
"no checker action is available", plus "a new request must be raised from the
originating workflow" for expired and blocked.

**Rejection reason.** Not required: `decision_reason` is optional, ≤512
characters, on both `approve` and `reject`. The panel says so in text; no
form field is built (a disabled input would add a control that does nothing,
and a multi-line field would need a `Textarea` primitive that is not
installed). **Eligibility** of the current user cannot be evaluated — there
is no session — so the panel says exactly that and that a requester cannot
approve their own request.

### 47.9 Density decision

`UI-04` §18 lists Maker-Checker Queue under `COMPACT` (40px); §35.14 lists it
under `DENSE` (32px) — while §35.14 also puts the admin "Approval Queue",
described as the same capability, under `COMPACT`. The two sections disagree.
Resolved toward **`COMPACT` 40px**: this is a decision surface with few rows,
it matches the other Ops queues, and 32px would shrink the row button's target.
Recorded as a governance inconsistency; to be revisited in the consolidated
visual QA.

### 47.10 Filter, default view, empty states

A labelled `Select` ("Status"), options **derived from the governed status
enum** (All + 5), with a polite "Showing N of M requests" region. **Default
view: Pending** — the page is a queue, its job is what a checker must act on,
and the Overview's count is exactly that set, so the two stay coherent. History
is not hidden: every terminal state and "All requests" are one selection away.
(The other Ops queues default to "All" because their records mix work and
context; here terminal requests are pure history.) **No search** — `IAM-02`
has none. Empty states: Pending filter → "No approval requests currently
require checker action."; another filter → "No approval requests match the
current view."; an empty register → "No maker-checker requests are
available." — none says controls are satisfied.

### 47.11 Backend gaps for a live page

Inspected first; not all are missing.

| Need | Exists? | Gap |
|---|---|---|
| Staff **list** projection | **No** — no list/get/search route | A paged, status-filterable read route through a staff-session path |
| **Detail** projection | Table exists; no route | Same, including `approval_decision` history |
| **Actor display-name** | **No** — `maker_user_id`/`approver_user_id` are opaque | A projection through IAM-01 (user directory) — IAM-02 holds no names |
| **Checker eligibility** for the current user | **No** | A projection combining identity, maker ≠ approver and SoD conflict, so the UI can enable/disable honestly |
| **Decision endpoint exposure** | **Yes** — `approve`/`reject` exist | Staff-session auth; the actor is currently a body field (`approver_user_id`), which a browser must not be trusted to supply |
| **Rejection-reason contract** | Optional `decision_reason` ≤512 | Decide whether reject should require one |
| **Originating-workflow context** | **No** — `entity_id`/`client_id` only | A cross-module subject-label projection so the UI can show "Payout Destination …" |
| **"Which approval is pending" for a subject** | **No** — WLT/CLT do not record it | A lookup by `(action, resource, entity_id)`, needed by the originating pages |
| **Approver authorisation** | **Not enforced** | Governance decision: `required_approver_roles` is stored and unread |
| **Approval policy rows** | **None seeded** | Every request uses the default; policy content is undecided |
| **Lazy expiry** | By design | A projection should expose `expires_at_utc`, or the queue reads `pending` past expiry |
| **`reject` independence** | No maker/SoD check | Governance decision: intended (withdrawal) or a gap |
| **Blocked detail** | `sod_check` stores matched rules | Decide whether staff may see them |
| **`cancelled` status** | In the DB CHECK, unwritten | No cancel/withdraw route exists |

### 47.12 Responsive reasoning (structural, not rendered)

Shell facts as `UI-04` §46.13 (content ≈ viewport − 48px below 1280px, ≈ viewport
− 305px from 1280px).

| Viewport | Layout | Table region | Columns |
|---|---|---|---|
| **1440** | Split: queue + 320px panel, 32px gap | ≈783px | Request, Subject, Status (~680px) |
| **1280** | Split | ≈623px | Request, Status (~440px) |
| **1024** | Split (`lg:`) | ≈624px | Same as 1280 |
| **768** | Queue full width; detail in Sheet | 720px | Request, Subject, Status |
| **430** | Compact list; detail in Sheet | — | Type / date · subject · module / status |

Columns respond to a **container query**: Subject at `≥44rem` (704px — an
arbitrary value, chosen because Subject fits at 720px and 783px but not at
623px, and no standard step falls between 672 and 768px), Created at `≥56rem`
(viewport ≈1553px in the split), Expires at `≥64rem` (≈1681px). At 1280/1024
the split still leaves Request + Status only; the Subject is then in the
panel. `≥1280` and `1024–1279` resolve identically (the sidebar's 241px arrives
as the viewport gains 256px), so the persistent panel is used from `lg:`. Below
`lg:` selection opens a right `Sheet` via `useIsLgUp`.

**Visual risks for the consolidated pass** (none verifiable without
rendering): (1) the widest status, "Blocked — Segregation of Duties", drives
the Status column to ~270px; (2) Subject fits at 704px with ~25px of slack on
estimated widths; (3) at 623px the queue shows only Request and Status — the
subject lives in the panel; (4) the row highlight appears only after
hydration; (5) the detail panel has eight sections and is the longest yet, so
its scroll behaviour in a 320px column and in the Sheet needs a real look.

### 47.13 Accessibility

One `<h1>`. The panel is `<h2>` (request type) with `<h3>` sections; in the
Sheet, `SheetTitle` carries the type. A real `<table>` with an accessible
name; one tab stop per row — a native `<button>` whose accessible name begins
with the visible label ("Destination approval, open Approval Request
DEMO-APR-001"), `aria-current` marking the open request; the row `onClick` is a
mouse-only convenience and the button has no `onClick` of its own. A real
`<label>` for the filter and an `aria-live="polite"` count. Status is icon +
text, never colour alone; `blocked` has its own icon so it cannot be read as
`rejected`. **No fake decision control is focusable** — both buttons are
natively `disabled`, with the reason in adjacent text, and the independent-
checker requirement is communicated in text, not by a control's absence. The
decision history is an ordered list. Loading/error states are not built —
nothing is fetched.

### 47.14 Shared components, shadcn and MCP

- **Created (page-specific, named by role):** `ApprovalRequestTable`,
  `ApprovalRequestDetail`, `ApprovalRequestsWorkspace`, `ApprovalStatusLine`.
- **`AixApprovalPanel` (`UI-04` §27, "potentially justified") is still not
  created.** §27 said to wait until the first real approval screen proves the
  shape. This is that screen, but it is the only full maker-checker
  presentation — the originating pages show a single line and a link — so
  there is no repetition to consolidate. Revisit if a second full approval
  presentation (e.g. the Admin "Approval Queue") is built.
- **Status presentation:** three status-line components now exist
  (`RequestStatusLine`, `DestinationStatusLine`, `ApprovalStatusLine`) — each
  over a different governed enum with its own icon set, so a generic wrapper
  would not remove real repeated logic; not created (the Overview's queue
  rows show plain text and need no component). The
  generic `ListDetailWorkspace` (now the **fourth** filter/panel/Sheet
  workspace) and the `Row`/`Section` helpers stay recorded consolidation
  candidates for the visual-QA pass.
- **shadcn:** no component added, updated or regenerated. `Table`, `Button`,
  `Sheet`, `Select` and `Label` sufficed; the REVIEW LATER primitives
  (`select`, `sheet`, `table`) were used, not modified. The official MCP was
  not needed (policy stopped at "reuse an installed primitive").

### 47.15 Boundaries

No `C`-classified Ops element. No trading, order-book, pricing or market-data
element. No amount, fee, balance, settlement or PnL figure — `IAM-02` has no
amount concept. No SEC-01 audit record duplicated. WLT and CLT subjects appear
only as the originating pages' own reference labels: no destination value, no
reveal, no KYC/AML detail. Confirmed by source inspection and a forbidden-term
scan of the rendered page.

### 47.16 What this phase explicitly did not do

No API/auth/permission code; no mutation and no local fake success; no
search; no reason field; no reveal; no audit timeline; no approver identity;
no required-role claim; no C-classified or Exchange element; no change to the
public homepage, backend, packages or lockfile.

## 48. UI Phase 2M — Staff/Operations Audit / Activity (`B`-classified Ops page)

**Status: IMPLEMENTED / VISUAL QA DEFERRED.** The fifth and last real page in
the initial Staff/Operations set, and its fourth List + Detail workspace. Same
visual-QA posture as every phase since `UI Phase 2E`. Baseline `d77ae73`, as the
brief stated. **`STAFF / OPS INITIAL UI SET: IMPLEMENTED / VISUAL QA DEFERRED`**
(§48.15).

### 48.1 Capability map (verified against `platform/services/sec1/src`, not assumed)

Unlike CLT-01, WLT-01 and IAM-02, **SEC-01 does have a real, paginated,
tier-redacted read**: `POST /internal/sec1/audit-events/search` (filters +
`cursor`, default 50, max 200) and `POST .../read` (one event). It is still not
callable from a staff browser session — the route needs the internal service
token, an `IAM-02` baseline permission (`sec1.audit_event.search` / `.read`) with
the acting user in the request body, and **no role is granted those permissions**
(`011_iam2_register_sec1_permissions.cjs`: "NO role_permission rows seeded").
Four findings shape the page:

- **The safe projection is explicit and small** (`lib/read-redaction.ts`), and
  hash-chain/integrity fields are never even selected.
- **Redaction leaves no marker.** At normal tier `session_id`, `request_id`,
  `correlation_id` and `metadata_redacted` are omitted "as keys, not
  null/placeholder, so a caller cannot distinguish 'redacted' from 'genuinely
  absent'" — deliberately. So a per-row "redacted" flag cannot exist.
- **Nothing carries module events into SEC-01.** `publishAudit` writes to the
  outbox topic `audit.event`; **no consumer or relay exists in the repository**;
  SEC-01's ingestion API needs a per-module source-identity binding, seeded only
  for `FND-01`, `IAM-01`, `IAM-02`; and only **four event types** are registered
  (`fnd01.generic_event`, `iam01.generic_event`, `iam02.generic_event`,
  `sec1.self_audit_event`). Every module-specific type (`clt1.application_
  submitted`, …) would be refused `SEC1_EVENT_TYPE_UNKNOWN`.
- **Emitter and store disagree.** SEC-01's `actor_type` is `client | staff |
  system | service`; `publishAudit`'s is `user | system | service` (no mapping for
  `user`). SEC-01 mandates `severity`, `action` and `result`; `wlt1.*`, `iam2.*`
  and the sensitive-read emitters supply none of the three (`clt1.*` supplies all).

| UI element / event field | SEC-01 route / model | Staff-visible (browser)? | Safe / redacted / internal | Status |
|---|---|---|---|---|
| Activity list | `POST .../audit-events/search` (cursor-paged) | No | safe | **PARTIAL/B** — real route, not callable |
| Event detail | `POST .../audit-events/read` | No | safe | **PARTIAL/B** |
| `audit_event_ref` (event reference) | projection | No | safe | **PARTIAL/B** |
| `event_type`, `action`, `result`, `severity` | projection | No | safe | **PARTIAL/B** |
| `event_category` | projection (from the event schema) | No | safe | **PARTIAL/B** — null for unregistered types |
| `source_module` (domain) | projection | No | safe | **PARTIAL/B** |
| `actor_type` | projection — `client`/`staff`/`system`/`service` | No | safe | **PARTIAL/B** |
| `actor_user_id` | projection, **both tiers** | No | safe but **opaque** | **OMITTED** — no display projection, so not shown |
| `entity_type`, `entity_id` | projection | No | safe, `entity_id` opaque | **PARTIAL/B** (label is a demo projection) |
| `reason_code` | projection, optional | No | safe | **PARTIAL/B** — shown only if present |
| `occurred_at_utc`, `ingested_at_utc` | projection | No | safe | **PARTIAL/B** |
| `classification` | projection | No | safe | **PARTIAL/B** |
| `retention_class`, `status` | projection | No | safe | **OMITTED** (§48.9) |
| `client_id` | only when the search is scoped to that client | No | **redacted** at normal tier | **OMITTED** |
| `session_id`, `request_id`, `correlation_id` | sensitive tier only | — | **redacted** | **OMITTED** — no correlation shown |
| `metadata_redacted` | sensitive tier only | — | **redacted** | **OMITTED** |
| Hash-chain / integrity fields | never selected | — | **internal** | **OMITTED** |
| "Sensitive access recorded" | event types that record a governed read (`wlt1.`/`kyc1.`/`aml1.` `*_read`) | No | safe (coarse) | **PARTIAL/B** |
| Per-row "redacted" marker | **none, by design** | — | — | **OMITTED** |
| Sensitive-tier read | `sec1.audit_event.read_sensitive`; writes a `sensitive_read_log` row | — | — | **OMITTED** — not used by this page |
| Audit export | **no route** | — | — | **OMITTED** |
| Security alerts, monitoring dead-letter, integrity verify, seal verify | separate `/internal/sec1/*` routes | — | — | **Not on this page** (Admin/Compliance) |

### 48.2 Event types represented

Only real `event_type` strings, verified against each module's `publishAudit`
call sites. Nine types, three modules:

| Event type | Module | Emitter supplies `severity`/`action`/`result`? | Recorded as |
|---|---|---|---|
| `clt1.application_submitted` | CLT-01 | **Yes** | actor `service`, action `submit`, `medium` |
| `clt1.application_under_review` | CLT-01 | **Yes** | action `start_review`, `medium` |
| `clt1.application_approval_requested` | CLT-01 | **Yes** | action `approve_request`, `medium` |
| `clt1.application_approved` | CLT-01 | **Yes** | action `approve`, `high` |
| `iam2.approval_requested` | IAM-02 | No | demo-projected |
| `iam2.approval_approved` | IAM-02 | No | demo-projected |
| `iam2.sod_conflict_detected` | IAM-02 | No | demo-projected (`blocked`, `high`) |
| `wlt1.proof_of_control_verified` | WLT-01 | No | demo-projected |
| `wlt1.sensitive_destination_read` | WLT-01 | No | demo-projected; metadata `access_action` is `read` |

The UI label ("Application approved") is a name for the event type, never new
vocabulary, and the exact string is always shown in the detail. WLT-01 alone
emits ~27 event types; KYC-01, AML-01, CFG-01, IAM-01 and the rest are not
represented (KYC/AML subjects are compliance-portal domain; the rest have no
Ops workflow yet). The mapping is data-driven, so another type is one entry.
`iam2.approval_expired` was deliberately not used: that emitter carries no
result, and mapping an expiry onto `success | failure | blocked` would invent
an outcome.

### 48.3 Route and navigation

**`/ops/audit-activity`** — the slug of the governed nav label "Audit /
Activity" (`/` → `-`), following the label → slug convention `client-requests`,
`wallet-destination-review` and `maker-checker-queue` set. `OPS_NAV` "Audit /
Activity" gains its `href` (label unchanged): **no inert row remains on the Ops
surface.** The Overview's Workflow Availability now shows all four as
"Available", and its Recent Staff Activity gains "View all".

```
app/ops/audit-activity/page.tsx             — header + disclosure + workspace (Server Component)
components/ops/
  audit-activity-data.ts                    — shared: vocabularies, event types, fixtures, helpers
  audit-result-line.tsx                     — icon + governed result
  audit-activity-table.tsx                  — DENSE table (≥768px) / compact list (<768px)
  audit-activity-detail.tsx                 — detail (panel + Sheet share it)
  audit-activity-workspace.tsx              — filters, selection, panel/Sheet composition
```

Header "Audit / Activity" / "Review governed operational activity and safe audit
evidence across supported AIX workflows." `DemoDisclosure`: "Interface preview —
activity records are demonstrative until the staff-facing SEC-01 audit
projection is integrated."

### 48.4 The safe-read model and redaction

The UI is designed against the **normal-tier projection** and models nothing
outside it. Two tiers exist: a normal read, and — with `sec1.audit_event.read_
sensitive` and for events whose schema is flagged `sensitive_read` — a sensitive
read that adds `session_id`, `client_id`, `request_id`, `correlation_id` and
`metadata_redacted` **and writes a `sensitive_read_log` row in the same
transaction** (fail-closed). This page uses only the normal tier and offers no
way to escalate.

Because redaction is invisible by design, the page carries **one static
statement**, identical for every event: "Standard-tier view. Session, request
and correlation identifiers, the client identifier and event metadata are not
included, and cannot be revealed from this page." No per-row indicator, no field
names, no counts — none is exposed, so none is invented. No raw metadata JSON,
payload, IP address, token, hash or error detail appears anywhere.

### 48.5 Actor and service-actor treatment

Only the actor **class** is shown — Client user, Staff user, System, Service —
because `actor_user_id` is an opaque id with no display projection, and no
personal name is ever invented. A **service** is shown as "Service · WLT-01"
(the emitting module) and described as "an automated internal service — not a
person", so it can never be read as a human actor. Client and staff classes
state that identity is an opaque id not shown in the preview.

### 48.6 Sensitive access, kept distinct from sensitive-tier redaction

Two different things share the word "sensitive":

1. **An event that RECORDS a governed read of restricted data** —
   `wlt1.sensitive_destination_read`, `kyc1.sensitive_evidence_read`,
   `aml1.sensitive_match_detail_read`. Represented coarsely: a "Sensitive
   Access" section reading "Sensitive access recorded", with the domain, actor
   class, target reference and timestamp the panel already shows. The value read
   is **never** shown, the data class is not shown (it lives in the omitted
   `metadata`), and there is **no reveal control**.
2. **An event whose OWN detail is sensitive-tier only** (`event_schema.
   sensitive_read`). Invisible in the normal-tier projection — covered by the
   static statement in §48.4.

A filter "Activity → Sensitive access only" isolates category 1.

### 48.7 Demo fixtures and cross-page consistency

10 obviously fictitious events (IAM-02 ×4, CLT-01 ×4, WLT-01 ×2), newest first,
references `DEMO-EVT-001`…`010`. No user name, email, client id, wallet address,
payload, IP, token, session id or hash. Each is consistent with a state already
shown elsewhere — including timestamps:

| Event | Matches |
|---|---|
| `clt1.application_submitted` 2026-09-16 10:05 | `DEMO-001` `submitted` |
| `clt1.application_under_review` 2026-09-14 09:20 | `DEMO-002` `under_review` since that time |
| `clt1.application_approval_requested` 2026-09-19 08:05, `iam2.approval_requested` 08:10 | `DEMO-002`'s pending `DEMO-APR-002` (created 08:10) |
| `iam2.approval_requested` 2026-09-18 15:30 | `DEMO-APR-001` (payout `DEMO-PAY-001`) |
| `iam2.approval_approved` 2026-09-10 14:52, `clt1.application_approved` 15:00 | `DEMO-APR-003` completed 14:52; `DEMO-004` approved 15:00 |
| `iam2.sod_conflict_detected` 2026-09-17 16:40 | `DEMO-APR-006` blocked (created 14:00) |
| `wlt1.proof_of_control_verified` 13:00, `wlt1.sensitive_destination_read` 13:02 (2026-09-14) | `DEMO-WLT-004`'s verified proof of control (registered 12:20) |

`UI Phase 2I`'s own two Recent Staff Activity events are **superseded**: they
used `actor_type` `user`/`system` (`user` is not a SEC-01 actor class), and a
"failed" registration refusal that no other page reflected. The Overview now
shows the two most recent shared events. No fixture is a `failure`; the one
non-`success` is the segregation-of-duties event (`blocked`).

### 48.8 List, density, filters, empty states

**Columns** (only what the projection backs): Time, Event, Domain, Actor,
Target, Result — Target, Domain and Actor appear as the table region widens
(container query `≥48rem` / `≥56rem` / `≥64rem`). No payload, hash, IP, token or
error column. **Density: `DENSE` 32px (`h-8`)** — `UI-04` §18 and §35.14 agree
that Audit/Activity is in the audit/high-volume tier (no conflict, unlike §47.9),
and every row is short plain text; cells use `py-1` so the shared `Table`'s `p-2`
does not push a row past 32px. **Filters:** *Domain* (derived from the modules
present) and *Activity* (All / Sensitive access only). **No search** — SEC-01
search takes exact-match filters, not free text; **no date-range control** — no
"Last 24 hours" analytics, and ten fixtures would make one decorative. **Default
view:** everything, newest first — an audit view does not hide history behind a
default. A polite "Showing N of M events" region. Empty states: a filter with no
match → "No activity matches the current view." with a "Clear filters" button; no
data at all → "No audit activity is available." Neither says nothing happened.

### 48.9 Detail panel and the deliberate omissions

Sections, each only where the projection backs them: **Event Summary** (event
type, domain, action, severity, category if any), **Actor Context**, **Target**
(reference, entity type, a link to the originating page where one exists),
**Result** (icon + governed value; reason code only if present), **Sensitive
Access** (only for events that record it), **Evidence & Redaction**
(classification + the static tier statement), **Reference** (event reference,
occurred, recorded). It clarifies one event; the list is the history, and there
is no timeline or related-event group.

- **Correlation:** none shown — `correlation_id` and `request_id` are omitted at
  normal tier, and the brief's default is no raw request ids. The event reference
  is the row's own handle.
- **Result:** the projection's `result` is NOT NULL, so one always exists; it is
  shown exactly. Nothing beyond `success | failure | blocked` is inferred.
- **Retention:** omitted — `retention_class` is a bare class label and no
  retention period is exposed; none is invented.
- **Actions:** **none.** No replay, retry, delete, edit or export control exists
  in the panel. **Export:** none — SEC-01 has no export route; WLT-01's
  `evidence_export` is a different, maker-checker-gated feature and is not
  conflated with audit export.
- **Errors:** no stack trace, database error or exception text is modelled; the
  safe error taxonomy remains separate.

### 48.10 Responsive reasoning (structural, not rendered)

Shell facts as `UI-04` §46.13 (content ≈ viewport − 48px below 1280px, ≈ viewport
− 305px from 1280px).

| Viewport | Layout | Table region | Columns |
|---|---|---|---|
| **1440** | Split: list + 320px panel, 32px gap | ≈783px | Time, Event, Target, Result (~750px) |
| **1280** | Split | ≈623px | Time, Event, Result (~510px) |
| **1024** | Split (`lg:`) | ≈624px | Same as 1280 |
| **768** | List full width; detail in Sheet | 720px | Time, Event, Result |
| **430** | Compact list; detail in Sheet | — | Event / time · target · domain / actor · result |

Domain appears at container `≥896px` (viewport ≈1553px in the split) and Actor
at `≥1024px` (≈1681px). `≥1280` and `1024–1279` resolve identically (the
sidebar's 241px arrives as the viewport gains 256px), so the persistent panel is
used from `lg:`. **Visual risks for the consolidated pass** (none verifiable
without rendering): (1) Target fits at 783px with only ~35px of slack on
estimated widths, and the widest target text drives that column; (2) at 1280px
the list shows only Time / Event / Result — target and domain live in the panel;
(3) whether `py-1` really yields a 32px row given the button's line height needs a
real measurement; (4) the row highlight appears only after hydration; (5) ten
`h3` sections' worth of detail in a 320px column.

### 48.11 Backend gaps for a live page

Inspected first; not all are missing.

| Need | Exists? | Gap |
|---|---|---|
| Staff-safe **list** projection | **Yes** — `audit-events/search`, cursor-paged (50 / max 200), ordered `ingested_at_utc DESC` | Staff-session exposure; the actor is a body field (`actor_id`), which a browser must not supply |
| **Detail** projection | **Yes** — `audit-events/read` | Same |
| **Authorisation** | Baseline `sec1.audit_event.search`/`.read` via IAM-02 | **No role holds these permissions** — nobody can pass the check today |
| **Ingestion of module events** | Ingestion API exists | **No relay**: `publishAudit` → outbox `audit.event` has no consumer in the repo |
| **Source bindings** | Seeded for FND-01, IAM-01, IAM-02 only | WLT-01, CLT-01, KYC-01, AML-01, CFG-01 have none |
| **Event-type registry** | 4 types seeded; no schema-management API | Every module-specific type is refused `SEC1_EVENT_TYPE_UNKNOWN` |
| **Mandatory-field completeness** | `clt1.*` complete | `wlt1.*`, `iam2.*` and the sensitive-read emitters omit `severity`/`action`/`result` |
| **`actor_type` mapping** | SEC-01: `client`/`staff`/`system`/`service` | Emitters use `user`/`system`/`service` — `user` has no mapping |
| **Actor display** | `actor_user_id` is opaque, visible at both tiers | A projection through IAM-01; SEC-01 holds no names |
| **Target labels** | `entity_id` is opaque | A cross-module subject-label projection (same gap as `UI-04` §47.11) |
| **Redaction metadata** | **None, by design** | A "redacted" marker would need an explicit design decision that reverses the no-oracle rule |
| **Sensitive-access classification** | Only the event type name identifies it | A schema flag or category exposed in the projection, and a matching search filter |
| **Filtering** | `source_module`, `event_type`, `severity`, `result`, `actor_user_id`, `client_id`, `entity_*`, occurred/ingested ranges, `correlation_id`, `request_id` | No `event_category` filter, no free text |
| **Correlation** | `correlation_id`/`request_id` are sensitive-tier only | A safe correlation field, if operations need one |
| **Audit export** | **No route** | Its own route, authority and evidence; not WLT's `evidence_export` |
| **Reads of the audit log itself** | `sensitive_read_log` is written | **No route reads it** |
| **Retention** | `retention_class` present | No retention periods exposed |

**Open backend/governance observations carried forward** (recorded, not fixed —
for a later dedicated security/compliance review; none is UI work). From
`UI Phase 2L`: IAM-02's `approve` does not enforce an approver role or
permission; `reject` performs no maker/SoD check; no `approval_policy` rows are
seeded. New in this phase: no role is granted the SEC-01 read permissions; no
relay carries module audit events into SEC-01; only 4 event types and 3 source
bindings are registered; emitter/store `actor_type` and mandatory-field
mismatches. IAM-02 was not modified.

### 48.12 Accessibility

One `<h1>`. The panel is `<h2>` (event label) with `<h3>` sections; in the Sheet,
`SheetTitle` carries the event. A real `<table>` with an accessible name; one tab
stop per row — a native `<button>` whose accessible name begins with the visible
label ("Approval requested, open DEMO-EVT-001"), `aria-current` marking the open
event; the row `onClick` is a mouse-only convenience and the button has no
`onClick` of its own. Two labelled filters and an `aria-live="polite"` count.
Result is icon + text, never colour alone, and `blocked` has its own icon. The
redaction and sensitive-access meaning is carried in text, not by an icon or a
hidden field. **The panel has zero interactive elements** — no button, form or
input — apart from the single "Open related page" link. Loading/error states are
not built — nothing is fetched.

### 48.13 Shared components, shadcn and MCP

- **Created (page-specific, named by role):** `AuditActivityTable`,
  `AuditActivityDetail`, `AuditActivityWorkspace`, `AuditResultLine`.
- **`AixAuditTrail` (`UI-04` §27) is not promoted.** §27 names it as a candidate
  once "both" audit surfaces exist (Staff/Ops Audit / Activity and Admin Audit /
  Sensitive Access). Only one exists, and the other cross-domain pages show a
  single event line at most, so there is no repetition to consolidate yet.
- **Recorded consolidation candidates for the visual-QA pass** (unchanged): a
  generic `ListDetailWorkspace` (now the **fifth** filter/panel/Sheet workspace,
  counting Wallet & Payout Destinations) and the `Row`/`Section` helpers.
- **shadcn:** no component added, updated or regenerated. `Table`, `Sheet`,
  `Select`, `Label` and `Button` sufficed; the REVIEW LATER primitives were
  used, not modified. The official MCP was not needed.

### 48.14 Boundaries

No `C`-classified Ops element. No balance, volume, PnL, fee, order book or
market data. No raw log viewer, SIEM, debug console or database event browser.
No payload, IP, token, session id, transaction hash or wallet address. No SEC-01
audit record is exported or replayed. Confirmed by source inspection and a
forbidden-term scan of the rendered page.

### 48.15 Staff / Ops initial UI set — closure

| Nav item | Route | Phase |
|---|---|---|
| Operational Overview | `/ops` | 2I |
| Client Requests | `/ops/client-requests` | 2J |
| Wallet Destination Review | `/ops/wallet-destination-review` | 2K |
| Maker-Checker Queue | `/ops/maker-checker-queue` | 2L |
| Audit / Activity | `/ops/audit-activity` | 2M |

**`STAFF / OPS INITIAL UI SET: IMPLEMENTED / VISUAL QA DEFERRED`.** All five
`B`-classified pages exist and every nav row is live. Not accepted visually —
no Ops page has been rendered. `C`-classified Ops pages (Deposit, Withdrawal,
Broking/RFQ Operations, Settlement, Reconciliation, Exceptions/Breaks) remain
unbuilt by design. The Admin/Compliance surface is entirely unimplemented.

### 48.16 What this phase explicitly did not do

No API/auth/permission code; no export, replay, retry, delete or edit; no search
or date range; no per-row redaction marker; no reveal; no timeline; no actor
name; no correlation id; no retention period; no `C`-classified or Exchange
element; no change to IAM-02 or any backend service, the public homepage,
packages or lockfile.

## 49. UI Phase 2N — Admin / Compliance Overview (`B`-classified Admin page)

**Status: IMPLEMENTED / VISUAL QA DEFERRED.** The first real page on the
Admin / Compliance surface, replacing `UI Phase 2B`'s shell placeholder at
`/admin`. Same visual-QA posture as every phase since `UI Phase 2E`. Baseline
`9f56035`, as the brief stated.

### 49.1 Capability map (verified against source, not assumed)

The decisive finding: **no cross-client aggregation exists in the backend.**
Every compliance module owns real, governed state, but each read is scoped
narrowly, and every route is `requireInternal`-guarded. So every count on this
page is **demo aggregation over the shared fixtures**, not a projection of a
real route. The map separates the two.

| Overview element | Source module / route / model | Safe admin visibility | Real vs demo | Status |
|---|---|---|---|---|
| KYC/KYB case state | `kyc1.kyc_case.status` — `pending_documents`/`completed`/`remediation`; `GET /internal/kyc1/cases` (**requires `application_id` or `client_id`**, ≤200, "never a global unbounded dump"), `GET .../cases/:id` | Safe — the case projection carries **no PII** | Vocabulary real; the count is demo | **PARTIAL/B** |
| Checklist counts | `kyc1.checklist_item.status` — `missing`/`received`/`verified`/`rejected`/`expired`; `GET .../cases/:id/checklist` (evidence ref/hash excluded from the routine projection) | Safe | Vocabulary real; counts demo | **PARTIAL/B** |
| CDD outcome computed? | `kyc_case.current_outcome_status` (`pending`/`pass`/`fail`/`remediation_required`; null until `compute-outcome`) | Safe (coarse) | Real concept; value demo | **PARTIAL/B** |
| Client lifecycle | `clt1.client_profile.status` — `active_limited`/`suspended`/`closed` | Safe | Vocabulary real; value = Client Portal's demo | **PARTIAL/B** |
| Beneficial-ownership completion | KYC/CLT authorised-party (`ubo`) data | Safe only as a boolean | Client Portal's boolean | **PARTIAL/B** |
| Independent approvals | `iam2.approval_request.status = pending` — **no list route exists** | Safe (no payload) | Vocabulary real; count = Maker-Checker fixtures | **PARTIAL/B** |
| Approval-gated workflows | 22 `verifyDecisionToken` call sites; 5 compliance-domain actions listed | Safe | Actions real; pending counts demo | **PARTIAL/B** |
| Sensitive-access activity | SEC-01 event types that record a governed read (`wlt1`/`kyc1`/`aml1` `*_read`); `POST /internal/sec1/audit-events/search` | Safe (coarse) | Concept real; count = Audit fixtures | **PARTIAL/B** |
| AML screening / matches / risk signals | AML-01: screening requests (`clear`/`potential_match`/`confirmed_hit`/`error`), matches (`sanctions`/`pep`/`adverse_media`), risk signals (`open`/`acknowledged`/`superseded`, severity `low`–`critical`); `GET .../risk-signals` **requires `subject_type` + `subject_ref`** | **No admin-safe projection**; match detail is sensitive-gated | Real concepts, no safe aggregate | **OMITTED** — "Interface planned" |
| "Transaction monitoring" | AML-01 `monitoring-runs` are **route-triggered periodic rescreening** (`periodic_due`/`list_version_changed`), not transaction monitoring; no transaction module exists | — | — | **OMITTED** |
| EDD | **No model in code**; KYC-01's `manual_review`/`edd` states are excluded from its CHECK ("no reachable code path") | — | — | **OMITTED** |
| Client risk rating | CLT-01 `CDD_RISK_RATINGS` (`low`/`medium`/`high`/`prohibited`) stored on `cdd_outcome.risk_rating`; **no read projection returns the value** — `outcome-status` returns only the four rollup STATUSES | Not projected | Real concept, no projection | **OMITTED** |
| CDD rollup statuses (`aml_sanctions_status` etc.) | `GET .../applications/:id/outcome-status` (IAM-02 `clt1.cdd_outcome.read`), per application | Safe (statuses) | Real, application-scoped | **OMITTED** (no fixtures; would invent AML facts) |
| Users / roles / permissions | IAM-02 `POST /iam2/users/:user_id/roles` (assign only) | — | — | **Review Area, planned** |
| Feature flags / configuration | CFG-01 `POST` evaluate / verify-decision / feature-changes / kill-switches | — | — | **Review Area, planned** |
| Scores, totals, averages, trends, %, charts | none in any governed model | — | — | **OMITTED** |

### 49.2 Corrections to `UI-04` §9

§9's route citations were written at the architecture stage and were checked
route-by-route this turn. Corrected in place, with pointers here:

| §9 row | What §9 said | What the source shows |
|---|---|---|
| Client Risk / KYC-KYB | `GET .../cases`, `/cases/:id`, `/cases/:id/outcome` | Correct — but the list **requires a scope filter** (`application_id` or `client_id`) |
| AML / Transaction Monitoring | `GET /internal/aml1/monitoring-runs`, `.../risk-signals`, `.../screening-requests` | `monitoring-runs` is **`POST` only** (plus `GET .../:run_id`); `screening-requests` is **`POST` only** (plus `GET .../:id` and `GET .../stuck`); `risk-signals` is subject-scoped; **monitoring is rescreening, not transaction monitoring** |
| EDD / Review | mapped to KYC-01 outcome-override | **No EDD model exists.** Outcome override is a maker-checker manual override of the CDD outcome — the nearest manual-review flow, not EDD |
| Users / Roles / Permissions | `GET /iam2/users/:user_id/roles` | **`POST` only** (assign a role); no read |
| Audit / Sensitive Access | `GET /internal/sec1/audit-events/*` | **`POST`** `search` / `read` (and `POST` for alerts) — `UI-04` §48.1 |

### 49.3 Composition

`/admin` replaces the placeholder — the only Admin page that is real. Four
sections, no KPI cards:

- **Primary column:** **Compliance Attention**; **Approval / Control
  Dependencies**.
- **Secondary column (`xl:`, 320px, single leading `border-l`):** **Client
  Compliance**; **Review Areas**.

The brief's fourth section, "Platform Compliance Surfaces" (area → UI state →
control owner), was **folded into Review Areas** as an owning-module column —
listing the same areas twice added no information. `ADMIN_NAV` is unchanged:
Compliance Overview had its `href` since `UI Phase 2B`; the other seven rows
stay inert. Header "Compliance Overview" / "Monitor governed client-
compliance, approval and control-review areas across the AIX platform."
`DemoDisclosure`: "Interface preview — compliance summaries are demonstrative
until the relevant staff-facing projections and integrations are connected."

### 49.4 What is deliberately not on the page

- **No score, KPI card, chart, gauge, heat map, percentage, total, average or
  trend.** The defaults the brief lists (Total Clients, Approval Rate,
  Compliance Score, Risk Score, AML Alerts This Month, KYC Completion %,
  Average Review Time) are all omitted: none is supported by a governed model,
  and none is honestly derivable from a handful of demo records.
- **No risk rating.** A governed rating exists but no projection returns it
  (§49.1); showing "Low/Medium/High" would be invented. The gap is recorded, the
  value omitted.
- **No AML or EDD content.** AML-01's concepts are real but have no admin-safe
  projection, so the page **says so** — an "AML screening and EDD — Not
  represented in this preview" row — instead of letting missing rows read as
  "all clear". No open signal, match, sanctions or PEP item is invented.
- **No sensitive KYC/AML data:** no names, addresses, dates of birth,
  identity documents, ownership percentages, raw screening results, reviewer
  notes, source-of-funds material or monitoring transactions.

### 49.5 Attention rules and status language

A row exists only where a **real governed state** meets a **consistent demo
source**: KYC/KYB (`pending_documents`), independent approvals (`pending`),
sensitive access (events that record a governed read). Each row states the
area, its owning module, a state, a count and what the count means. State
wording is a governed label (`Pending Documents`, `Pending Approval`) or a plain
factual statement (`Sensitive access recorded`, `Not represented in this
preview`) — **never a judgement**: no "Healthy", "Safe", "Good" or
"Compliant". No severity level — no real safe one exists here. Counts are
understated list metadata beside each area, not tiles.

### 49.6 Demo data reuse and cross-surface consistency

`admin-compliance-data.ts` is a **narrow projection with no fixture of its
own**. Each figure is computed from a shared source; verified against the
rendered pages this turn:

| Admin says | Computed from | Checked against |
|---|---|---|
| KYC/KYB "Pending Documents", "1 Missing · 1 Received", beneficial ownership "on file" | `client-demo-data.ts` + `compliance-data.ts` | `/app/compliance-status` shows "Pending Documents", "Not Yet Submitted", "Received — Under Review", "On file" |
| Lifecycle "Active (Limited)" | `client-demo-data.ts` | `/app` |
| "2 requests" = 1 destination approval + 1 application approval | `approval-request-data.ts` | `/ops/maker-checker-queue` default view lists exactly those two |
| Approvals agree with the Ops Overview | same | `/ops` "Maker-Checker Queue 2 items" |
| "1 event (WLT-01)" sensitive access | `audit-activity-data.ts` | `/ops/audit-activity` has exactly one sensitive-destination-read event, WLT-01 |

Where the Client Portal words a checklist item for the client ("Not Yet
Submitted"), the Admin page uses the governed enum term for a compliance user
("Missing") — same fact, audience-appropriate wording.

### 49.7 Client compliance and KYC/KYB

The Client Compliance panel summarises the one demo client (`DEMO-CLI-001`, the
client of approved application `DEMO-004`): lifecycle, case type (Entity (KYB)),
KYC/KYB status, "CDD outcome: Not yet computed" (a real fact —
`current_outcome_status` stays null until `compute-outcome`, which is what moves a
case out of `pending_documents`), checklist counts by governed status, and
whether beneficial-ownership information is on file. It cannot say "complete"
where the Client Portal says "Pending Documents", because both read one source.

### 49.8 Approval dependencies and the Admin / Ops authority boundary

Approval / Control Dependencies lists five real approval-gated actions in the
compliance modules — `clt1.application.approve`,
`wlt1.destination.approve_apply`, `kyc1.outcome.override`,
`aml1.match.confirm`/`.dismiss`, `sec1.security_alert.close` — each verified at
its `verifyDecisionToken` call site. A pending count appears **only** for a
workflow with requests in the shared Maker-Checker fixtures; the rest read "Not
represented in this preview", never "0 pending" (not represented ≠ none).

**Informational only.** The section lists no request, links to none, and offers
no action — it is not a second Maker-Checker Queue, and being on an Admin page
grants no approval authority (the copy says so). The control is described as
exactly what IAM-02 enforces on `approve` today — a different user than the
requester, no segregation-of-duties conflict — **not a role**, because IAM-02
stores `required_approver_roles` but never reads it (`UI-04` §47.5).
Admin is not assumed to hold Ops actions; no review or approval control exists on
the page.

### 49.9 Sensitive access and navigation

Sensitive access is a coarse row ("1 event · Sensitive access recorded · SEC-01")
grounded in the real event concept from §48.6 — no payload, no actor identity, no
reveal control. **No link to any Ops page and none to an unbuilt Admin route:**
the Ops pages are deliberately not a shortcut hub, and Review Areas lists the
seven planned areas as plain, non-focusable text with their exact governed labels
("Interface planned"). Visible navigation is not a permission grant, and hidden
navigation is not a security control (§10) — the panel says the first. `C`-
classified Reporting and Incidents / Exceptions are absent.

### 49.10 Density, layout and responsive reasoning (structural, not rendered)

Rows are ≥40px (`COMPACT`) with a wrapped second and third line — Attention rows
are explanatory, not single-line queue rows, so no fixed row height is imposed.
`≥1280px` (`xl:`): `xl:grid-cols-[1fr_320px]`, `xl:gap-8`, `xl:pl-8` — the same
values `UI Phase 2I` established, where the secondary column holds real evidence
(the client summary and the planned-area list), so two columns is justified here
and not for symmetry. Below `xl:`: one column in the same order — Attention,
Dependencies, Client Compliance, Review Areas. `1024–1279px` therefore stacks
(the persistent sidebar and the split engage together at `xl:`, as on every
prior page); `768–1023px` and `<768px` are single-column lists with no table and
no horizontal scroll. Content width ≈ viewport − 48px below 1280px and ≈ viewport
− 305px from 1280px, so the primary column (content − 320px panel − 32px gap) is
≈ 623px at 1280px and ≈ 783px at 1440px — ample for the right-aligned count beside
each area. **Visual risks for
the consolidated pass** (none verifiable without rendering): (1) the Attention
rows carry three lines of text each — their rhythm against the 24px section gap
needs a real look; (2) "Not represented in this preview" (~195px) shares a Dependencies row
with a workflow name of up to ~40 characters, so at 430px (≈398px content) the two
will wrap rather than fit on one line;
(3) the seven-item Review Areas list plus the client panel makes the secondary
column tall.

### 49.11 Accessibility

One `<h1>`; each section is a `<section>` labelled by its own `<h2>`; the
secondary column is a labelled `<aside>` (complementary landmark). Attention and
Review Areas are lists; the client summary is a description list (term/value).
State is text — there is no colour signal at all. **No link, button, input or
focusable element exists inside `<main>`**, so the inert planned areas cannot be
a keyboard trap and there is no fake link. Counts carry their noun ("2
requests", "1 event") so each is meaningful out of context. Empty-state text is
implemented for every section ("No items are represented in this demo view.") and
never says "all clear". DOM order matches reading order.

### 49.12 Backend gaps for a live Compliance Overview

Inspected first; not all are missing.

| Need | Exists? | Gap |
|---|---|---|
| **Cross-module attention aggregation** | **No** | A route (or composition of the rows below) — nothing aggregates across modules today |
| **Client compliance summary** | Per-scope reads exist (`GET .../kyc1/cases?client_id=`, CLT reads) | A cross-client summary; KYC's list is deliberately scope-bound |
| **KYC/KYB status projection** | **Yes**, safe, no PII — but scoped | Counts by `status` across clients; today only per client/application |
| **AML monitoring summary** | Real concepts; global `GET .../screening-requests/stuck` only | A safe aggregate of screening state, matches and risk signals; today signals need `subject_type` + `subject_ref` |
| **"Transaction monitoring"** | **Does not exist** — `monitoring-runs` is rescreening; no transaction module | A backend capability, not a projection (`UI-04` §9's label overstates it) |
| **EDD summary** | **No model** | A backend lifecycle decision first |
| **Client risk rating** | Stored on `cdd_outcome.risk_rating`; **no read returns it** | A safe projection decision — whether an admin may see the rating |
| **Approval summary** | **No list route** in IAM-02 (`UI-04` §47.11) | A read route by status; and the approver-role gap (not enforced) affects what "requires an approver" can truthfully say |
| **Safe sensitive-access summary** | SEC-01 `audit-events/search` exists, cursor-paged | No role holds the read permission; no relay carries module events into SEC-01; sensitive-access is identified only by event-type name (`UI-04` §48.11) |
| **Role-aware admin projection** | **No** — no session/role model; the actor is a request-body field | Staff-session auth and a projection that varies by role; until then nothing on this page is permission-aware |

The `UI Phase 2L`/`2M` governance observations are recorded here only where they
bear on this page (approver role not enforced; no role holds the SEC-01 read
permissions; no relay into SEC-01) — none is fixed here, and IAM-02 and SEC-01
are unmodified.

### 49.13 Shared components, shadcn and MCP

- **Created (page-specific, named by role):** `ComplianceAttention`,
  `ControlDependencies`, `ClientComplianceState`, `ReviewAreas`, and the
  projection module. All are Server Components — no interactivity is needed.
- **Reused:** `PageHeader`, `DemoDisclosure`, and the existing shared demo-data
  modules (`client-demo-data`, `compliance-data`, `approval-request-data`,
  `audit-activity-data`, `client-request-data`) — imported from the Client and
  Ops directories as data only. **No Ops page behaviour changed.**
- **No shadcn primitive is used at all** (no `Table`, `Select` or `Sheet`), so
  none of the REVIEW LATER components was touched; the official MCP was not
  needed. **No dashboard block was copied.**

### 49.14 Boundaries

No `C`-classified Admin element (Reporting, Incidents / Exceptions). No balance,
PnL, market data, order book, Exchange operation, settlement amount or trading
volume. No unsupported risk score. No approval or review action, no mutation, no
fetch, no server action, no auth or permission code.

### 49.15 What this phase explicitly did not do

No score or KPI card; no AML, EDD or risk content; no link to an Ops page or an
unbuilt Admin route; no approval authority implied; no change to IAM-02, SEC-01
or any backend service, the public homepage, any Ops page's behaviour, packages
or lockfile.
