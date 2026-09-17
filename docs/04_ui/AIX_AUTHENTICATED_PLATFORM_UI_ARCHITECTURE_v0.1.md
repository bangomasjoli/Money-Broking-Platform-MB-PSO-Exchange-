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
| Client Risk / KYC-KYB | Kept, mapped to `KYC-01` | **B** | `GET /internal/kyc1/cases`, `/internal/kyc1/cases/:id`, `/internal/kyc1/cases/:id/outcome` — real, partial (through Phase 4B). |
| AML / Transaction Monitoring | Kept, mapped to `AML-01` | **B** | `GET /internal/aml1/monitoring-runs`, `/internal/aml1/risk-signals`, `/internal/aml1/screening-requests` — real, partial (through Phase 3E). |
| EDD / Review | Kept, mapped to `KYC-01` outcome-override | **B** | `POST /internal/kyc1/cases/:id/outcome-override/request`\|`/apply` — real. |
| Approval Queue | Kept, mapped to `IAM-02` (same capability as Staff/Ops Maker-Checker Queue, admin-scoped view) | **B** | Same `iam2/approvals/*` routes as §8. |
| Users / Roles / Permissions | Kept, mapped to `IAM-02` roles | **B** | `GET /iam2/users/:user_id/roles`, plus `IAM-01`'s session/account surface — real, `requireInternal`-guarded. |
| Feature Flags / Configuration | Kept, mapped to `CFG-01` | **B** | `POST /internal/cfg1/features/evaluate`, `/internal/cfg1/feature-changes/request`\|`/apply`, `/internal/cfg1/kill-switches/activate` — real, partial (through Phase 3B). |
| Audit / Sensitive Access | Kept, mapped to `SEC-01` | **B** | `GET /internal/sec1/audit-events/*`, `/internal/sec1/security-alerts/*` — real, accepted through Phase 5. |
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
