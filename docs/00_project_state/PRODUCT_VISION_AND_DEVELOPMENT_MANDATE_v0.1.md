---
document_id: STATE-006
title: AIX Full Compliance — Product Vision and Development Mandate
version: v0.1
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Product mission, engineering standard and delivery-governance mandate (project-owner directive PROJECT-MANDATE-001)
owner: Unassigned
effective_date: 2026-10-21
last_reviewed: 2026-10-21
supersedes: none
baseline_commit: a2a4a2f
---

# AIX Full Compliance — Product Vision and Development Mandate

> ## APPROVED — HUMAN OWNER ACCEPTANCE RECORDED 2026-10-21
>
> | | |
> |---|---|
> | Task | PROJECT-MANDATE-001 |
> | Owner acceptance | **APPROVED** |
> | Date | 2026-10-21 |
> | Independent review | GPT review: ACCEPT, following focused corrections (as reported by the owner; no review artefact is held in this repository) |
> | Accepted scope | Product vision, Controlled Excellence, engineering discipline and commercial delivery objectives |
> | Not conferred | No architecture approval; no regulatory approval; no scope expansion authorised |
> | Authority | Existing approved masters and decisions remain authoritative. `DEC-015` remains NOT_ACCEPTED |
> | Open | D-1 through D-5 (§16) remain open as applicable |
>
> This mandate amends no master, decision, migration rule, runtime guard or acceptance status of
> any other document, and it authorises no implementation. Where it disagrees with an approved
> source, the approved source wins (§1, §15). Nothing here is a regulatory, legal or licensing
> statement.

## 1. Purpose and authority

1. State the long-term product mission and the engineering standard future agents and reviewers
   apply, in one place, without duplicating the masters.
2. **Authority.** The hierarchy in [`CLAUDE.md`](../../CLAUDE.md) §2 is unchanged:
   `DOCUMENT_REGISTER.md` owns document versions; `OPEN_FINDINGS.md` owns findings;
   `DECISION_LOG.md` owns decisions; the approved masters (`01_masters/`) own scope and
   architecture. This mandate is **subordinate to all of them**.
   Now accepted, it guides product objectives, Controlled Excellence, engineering and review
   discipline, full-platform delivery expectations and commercial handover objectives. It does
   **not** override Doc 00, the Project Charter, `DEC-011` to `DEC-014`, any approved architecture,
   existing runtime restrictions or existing licence controls. Acceptance does not amend or
   reinterpret any of them; changing those needs their own change control (Doc 00 v1.5 §26,
   Charter v1.5 §16.5, `DECISION_LOG.md`). `DEC-015` remains NOT_ACCEPTED.
3. **Acceptance** was given by the project owner on 2026-10-21 and is recorded in the header of
   this document. No model output is acceptance (Charter v1.5 §15.0); the owner's statement is the
   acceptance, and nothing further is asserted.
4. This is the owner's direction, not a repository-evidenced fact. Statements about the owner's
   intent in §2–§3 are recorded as directed and are not independently verified.

## 2. Independent ownership

- AIX Full Compliance is **independently developed software**, owned by the project owner. It is
  separate from AIX Investment Group Company Ltd and from any licence or authorisation that
  entity or anyone else holds (`CLAUDE.md` §1).
- The project owner claims **no regulatory licence** by virtue of owning the software. Nothing in
  this repository may imply employer ownership, regulatory approval, or an entitlement to operate
  under any employer's licences.
- The approved masters record a licence position attributed to AIX (Doc 00 v1.5 §1.C; Charter
  v1.5 §4). That is the regulatory context the masters design against. It does **not** mean this
  software operates, or is entitled to operate, under any AIX Investment Group licence, and it is
  not an ownership claim or evidence that the software, its owner or any buyer holds an approval.
  How the software relates to a licensed operator remains an open governance decision (`CLAUDE.md` §1; conflict C-1, §15).
- Intellectual-property ownership, licence terms and any buyer's obligations are commercial and
  legal matters outside this document. No contract is assumed to exist.

## 3. Long-term product mission

Build a **complete, institutional-grade, commercially deliverable** financial-technology software
platform, suitable for eventual sale, licensing, deployment or handover to an institutional client
or an appropriately authorised operator.

It is **not**: an MVP; a proof of concept; a presentation prototype; a set of disconnected
modules; a static front end; a documentation-only architecture; or a perpetually unfinished
system. The finished product has working end-to-end functionality, reliable integrations,
financial controls, administrative tools, operational capability, documentation and commercial
handover provisions.

"Complete" means complete **within the currently approved scope** (§6, §8). It never means
"every adjacent financial product", and it never means scope grows without a decision (§8).

## 4. Institutional-grade standard

A capability meets the standard only when, as applicable, all of these exist and are evidenced:

| Layer | Evidence required |
|---|---|
| Definition | Approved requirements; architecture and boundaries; database design; API contracts |
| Build | Implementation; functional workflows; integration adapters; error handling; access controls; transaction integrity |
| Proof | Tests; failure recovery demonstrated; observability; operational procedures |
| Sign-off | Independent verification; human acceptance recorded in the acceptance record |
| Delivery | Deployment and support preparation |

**Architecture approval is not completion.** An approved blueprint, an accepted module and a
passing test run are each one row of this table, not the whole of it. Status vocabulary and its
limits remain as in `CLAUDE.md` §4 and are not changed here.

## 5. Pragmatic engineering principles

Permanent principle (**Controlled Excellence**):

> Achieve the highest practical institutional engineering standard through the simplest secure,
> maintainable and economically justified solution.

1. **Requirements before solutions.** Name the requirement and its source before proposing a design.
2. **Reuse before new infrastructure.** Extend existing code and accepted modules first.
3. **Prefer established standards, proven libraries and simple designs.**
4. **Engineer in proportion to financial, security and operational risk.** Money movement,
   ledger integrity, key custody and access control get the deepest scrutiny; cosmetic work does not.
5. **No premature microservices, abstractions or optimisation.** (`DEC-013` clause 12: module ≠ service.)
6. **No speculative scaling.** Scale decisions rest on a stated workload; the current assumptions
   are Charter v1.5 §18, refined by the IMP-02 measurement programme, not invented.
7. **One source of truth.** Do not duplicate content across documents; link to the owner.
8. **No repeat audits without new material evidence** or a meaningful, named risk reduction.
9. **Every implementation and review has stopping criteria** stated up front (acceptance
   criteria; a maximum review count after which the owner decides).
10. **Count cost** — development, operating and maintenance — before recommending significant complexity.
11. **Never trade essential financial integrity or security for simplicity.** Controls are not
    relaxed in non-production (Doc 00 §21A rule 7).
12. **Do not build sophisticated infrastructure merely because it looks institutional.**

**Major engineering proposals** state: (A) the real requirement; (B) why change is needed;
(C) the simplest viable approach; (D) alternatives; (E) the risk if omitted; (F) development
effort; (G) operating and maintenance burden; (H) dependencies; (I) testable acceptance
criteria; (J) the decision required, if any. Actual financial or security defects outrank
cosmetic improvements. Routine implementation uses Sonnet; deeper independent review is reserved
for high-risk architecture, money movement, security and financial-integrity decisions
([`CLAUDE_CODE_USAGE_RULES.md`](CLAUDE_CODE_USAGE_RULES.md)).

## 6. Full target capability landscape

Long-term target areas follow. **Listing an area is not approval, implementation or acceptance.**
Classes: **APPROVED-EXISTING** = approved existing product scope; **APPROVED-BUILD** = approved
future build capability (`DEC-013`; production-gated); **PROPOSED** = needs a decision;
**EXT** = depends on an external provider or contract; **PROD-AUTH** = production use depends on
regulatory/contractual authorisation. The class is indicative; the approved source decides.

| Capability area | Class | Governing source / note |
|---|---|---|
| Institutional client lifecycle; KYC/KYB/UBO/AML | APPROVED-EXISTING | Doc 00 §5.3; CLT-01, KYC-01, AML-01 (see `MODULE_STATUS.md`) |
| Identity, MFA, RBAC, SoD | APPROVED-EXISTING | IAM-01, IAM-02 (accepted baselines) |
| Agency spot broking; OTC workflows | APPROVED-EXISTING · EXT · PROD-AUTH | Doc 00 §5.1, §7; `DEC-012` Model A; TRD-01 not started |
| External venue routing (multi-venue) | APPROVED-BUILD · EXT · PROD-AUTH | `DEC-012` Model B, per-venue gated |
| Order and execution management | APPROVED-EXISTING | Module Index v1.4 (OMS-01, EXE-01 — blueprints pending) |
| Digital-asset custody integration | EXT · PROD-AUTH · PROPOSED | Third-party custody only (Doc 00 §8.2); detail depends on `DEC-015` (NOT_ACCEPTED) |
| Client-money safeguarding | APPROVED-EXISTING | Charter §9.2; detail depends on `DEC-015` |
| Payment and payout orchestration; fiat and virtual-account integration | APPROVED-EXISTING (PSO baseline) · APPROVED-BUILD (beyond) · EXT | Doc 00 §5.2, §12D; `DEC-015` proposed |
| Ledger and settlement; reconciliation and finance reporting | APPROVED-EXISTING | LED-01, REC-01 (not started); `DEC-011` precedes LED-01 schema freeze |
| Treasury and liquidity integration | APPROVED-EXISTING · EXT | TRE-01 — external LP funding and fee-side position management only (conflict C-4) |
| Securities exchange capabilities | APPROVED-BUILD · PROD-AUTH | `DEC-013`; EXM-01/EXO-01/EXC-01/EXP-01; separate Exchange domain |
| RWA and tokenisation | APPROVED-BUILD · PROD-AUTH | `DEC-013` clause 7; Doc 00 §12B; classification gate |
| Asset and instrument governance | APPROVED-EXISTING | Doc 00 §12A; AST-01 (branch-resident planning) |
| Administrative and compliance portals | APPROVED-EXISTING | PRT-01; `04_ui/` (visual QA deferred) |
| Audit and security monitoring | APPROVED-EXISTING | SEC-01 (accepted baseline) |
| Regulatory and operational reporting | PROPOSED | No dedicated module recorded; scope needs a decision |
| APIs and external integrations | APPROVED-EXISTING · EXT | Per-module API contracts; adapters per §7 |
| Deployment and environment management | APPROVED-EXISTING | Doc 00 §1.E; IMP-02; Master 11 (stale v1.2) |
| Monitoring and incident management | APPROVED-EXISTING | INC-01; Charter §19 |
| Backup and disaster recovery; capacity and resilience testing | APPROVED-EXISTING | Charter §18 (RPO/RTO targets); IMP-02 measurement programme |
| Institutional client implementation; training, manuals, support | PROPOSED | Not yet scoped; see §12 |
| Commercial product handover | PROPOSED | See §12; operator relationship open (C-1) |

Nothing in this mandate silently expands the product into an unrelated regulated business model.

## 7. Build versus operate

Seven stages are kept distinct, and a later stage is never inferred from an earlier one:

| Stage | Meaning | Gate |
|---|---|---|
| A | Capability conception and design | Requirements and reviewed blueprint (Charter §15.3) |
| B | Development and implementation | Approved task; accepted blueprint |
| C | Synthetic-data integration testing | Synthetic data only; non-production PII is prohibited (Doc 00 §12.5) |
| D | Controlled demonstration and UAT | Internal permitted; **external demo of gated capabilities fails closed pending `R6-Q1`** (Doc 00 §1.E, §23) |
| E | Production technical readiness | Evidence per §4, §11; not regulatory approval |
| F | Regulatory and contractual authorisation to operate | Outside this repository's authority; held by whichever authorised operator would run the software |
| G | Live production activation | `DEC-013` / Doc 00 §21 fail-closed gate; maker-checker |

Consequences:
- Pending regulatory approval or a missing vendor contract does **not** by itself stop stages A–D.
  Safe-environment work may use **test adapters** against a provider-neutral interface.
- Never activate a live regulated service without the required authorisations.
- **Never present a simulated or sandbox integration as a real one** — in code, UI, documents, demos or reports.
- Never bypass production safeguards; never weaken security or financial-integrity controls.
- Software acceptance is **never** regulatory approval, and technical readiness is never permission to operate.

## 8. Existing architecture boundaries (preserved unchanged)

Three classes, never collapsed (`CLAUDE.md` §3; `DEC-012`, `DEC-013`; Doc 00 v1.5 §7.7, §20; Charter §6.3–§6.5):

- **Permanently prohibited, every environment, no activation path:** MB Spot internal
  client-to-client matching (Model C); an AIX order book or matching engine for MB Spot; crossing
  or netting clients; proprietary market making; principal dealing; AIX principal liquidity.
  MB Spot is external-LP, agency / back-to-back.
- **Build-authorised, production-gated:** AIX Exchange (separate securities domain with its own
  matching in `EXO-01`, never reachable from an MB-domain module), RWA securities capabilities,
  AIX Pay beyond baseline, Model B routing.
- **Out of scope, no build:** derivatives and futures; margin and leverage; lending/borrowing of
  client assets; staking, yield, DeFi yield; privacy coins; algorithmic stablecoins and MYR pairs
  *where currently prohibited*; self-custody wallet service.
- `assertNoExchangeRuntime` stays active and unweakened; `MIG-001` is specified, not authorised.
  `DEC-015` (`STR-04` v0.4) is **NOT_ACCEPTED**.

**Current scope is the governing rule today, not an automatic permanent ceiling.** The owner may
propose new or wider business capabilities. Any proposal needs a separate owner decision through
`DECISION_LOG.md` and an architecture review proportionate to its actual financial, security and
regulatory risk (§5, §15). **This mandate approves no expansion**, and the owner's ambition
does not silently override any item above. The permanent MB Spot prohibitions are stated by the
masters to have no activation path in any environment; changing them would mean amending those
decisions and masters themselves, which this mandate does not recommend (C-4).

## 9. Measurable quality philosophy

Quality is a set of checks that can pass or fail, not an adjective.

1. Every requirement has a **testable acceptance criterion** before build starts.
2. A finding closes on repository evidence — a commit and a reproduced result — never on a model's report.
3. Tests prove behaviour at the risk-appropriate level: money movement, ledger, authorisation and
   key handling get adversarial and failure-path tests; low-risk UI gets proportionate checks.
4. Independent verification is required where §5.4 says risk warrants it; a review that finds no
   new material evidence does not generate another cycle.
5. Reports state what was run and what was not. A skipped check is reported as skipped.

## 10. End-to-end integration

Module success is not platform readiness. Before any "platform complete" statement, the full
platform passes **cross-module end-to-end testing** of the real flows — onboarding → screening →
order/execution → settlement → ledger → reconciliation → reporting, and the deposit, payout and
incident/freeze paths — in a non-production environment with synthetic data and test adapters.
`E2E-01` (v1.1, not started) is the existing blueprint anchor. An end-to-end result is
evidence for stage C/D only; it says nothing about stage F or G.

## 11. Operational readiness

A capability is operationally ready only with: runbooks; monitoring and alerting; incident and
freeze procedures (INC-01); backup, restore and disaster-recovery procedures **actually rehearsed**
against the Charter §18 RPO/RTO targets; capacity evidence from measurement (not assumption);
secrets in KMS/vault (Doc 00 §12.5); a reproducible deployment with rollback; and recorded
support responsibilities. Production prerequisites already recorded as open (for example the KMS
dependency in `WDR-FIND-001`, the perimeter work in IMP-02 and `FND-FIND-001`) remain open; this
mandate closes none of them.

## 12. Commercial client handover

The platform should be deliverable professionally. Design for, and later produce:

- clear IP ownership and third-party licence disclosures; an external-dependency register;
- reproducible installation, upgrade and rollback procedures; environment isolation;
- client-specific configuration (no per-client code forks);
- administrator manuals, operator runbooks, API/integration documentation;
- security-assurance evidence; test and acceptance records;
- monitoring and incident processes; backup and recovery instructions;
- client training, service handover, defined support and maintenance/versioning responsibilities;
- commercial acceptance criteria agreed with the buyer.

**Not assumed:** that any commercial contract exists; that a multi-tenant or white-label
architecture is needed. That choice is deferred until requirements and a cost analysis exist (§13).
Any deployment for an operator other than the one whose licence position the masters record
touches the licence-scope baseline and the sealed CFG-01 licence-lock registry (conflict C-2) and
needs its own decision.

## 13. Cost and complexity discipline

- Default to a single-deployment, modular-monolith-compatible design. A new service, queue, store,
  vendor or abstraction needs a written case answering §5 (A–J) and naming its running cost.
- Prefer buying or reusing a proven component over building one, unless the component sits inside
  a regulated control boundary where AIX must own the logic.
- Third-party and vendor costs are an external dependency until contracted; adapters and
  provider-neutral interfaces let build proceed without committing to a vendor.
- Charter §16.2 budget and timeline remain **to be defined**; this mandate defines neither.

## 14. Decision and acceptance governance

- Humans decide: acceptance, merge, push, new migrations, runtime guards, capability gates,
  architecture decisions, `DECISION_LOG.md` entries, status-vocabulary changes, and
  `platform/BLUEPRINT_VERSION` (`CLAUDE.md` §5).
- One module or task per session; no task is active by default; report options and wait.
- **No AI recommendation is human acceptance.** A model's own review in the same session as the
  implementation is not independent.
- Review depth is proportional to risk (§5.4, §9.4). The owner, not a loop, decides when a review
  series ends. Documentation-only tasks follow `CLAUDE.md` §6.
- Acceptance of this mandate is recorded concisely in its own header; no separate acceptance file
  or `DECISION_LOG.md` entry exists or is claimed.

## 15. Out-of-scope and conflict handling

Where the owner's ambition conflicts with an approved source: identify the exact source; state its
practical effect; state the wider desired capability; recommend whether reconsideration is
commercially worthwhile; name the separate decision needed. **This task amends none of them.**
Current scope governs today but is not an automatic permanent ceiling (§8): proposed expansion is a
separate owner decision with risk-proportionate architecture review, and this mandate approves none.

### Conflict matrix (material items only)

| ID | Source and section | Existing rule | Owner's new ambition | Real conflict? | Engineering impact | Recommended action | Separate owner decision? |
|---|---|---|---|---|---|---|---|
| C-1 | Charter v1.5 §4 (Project Vision: "operating under AIX's Labuan Money Broking and PSO licences"); Doc 00 v1.5 §1.C; `CLAUDE.md` §1 | Platform is framed as the build for AIX's licence position; the software-to-operator relationship is an open governance decision | Independent software, no claim to any licence, saleable or licensable to another authorised operator | **Real (framing).** Not a build blocker | None on code today. Risk is documentary: masters could be read as ownership/licence claims; a buyer's diligence would notice | Keep masters unchanged. Resolve via an explicit owner decision on the operator relationship, then a controlled Charter/Doc 00 wording revision | **Yes — D-1** |
| C-2 | Doc 00 v1.5 §9A, §25.3; CFG-01 seeded prohibited-feature registry and sealed hash; Master Module Index | One licence-scope baseline, recorded against the single licence position the masters attribute to AIX, enforced by a sealed, seeded registry | Client-specific configuration for a different operator | **Real if a second operator is a goal.** Compatible while the baseline is unchanged | Per-operator scope would touch seeded identifiers, the sealed hash and Doc 00 — all frozen. A multi-operator design has real cost | Defer. Do not pre-build multi-tenancy. When a concrete buyer exists, run the §5 A–J analysis | **Yes — D-2 (when a buyer exists)** |
| C-3 | Doc 00 v1.5 §20.6, §8.1; `DEC-013` clause 6; Charter §6.5 | Derivatives, futures, margin, leverage, lending, staking, yield, privacy coins, algorithmic stablecoins and MYR pairs (where currently prohibited), self-custody — **no build** | A "complete" platform | **Compatible today** — "complete" means within the currently approved scope; out-of-scope is a scope decision, not a permanent ceiling | None | No action now. Any item can be proposed later only as a separate owner decision with a named client requirement, its regulatory basis and a risk-proportionate architecture review (§8) | No (only if the owner proposes a specific item) |
| C-4 | Doc 00 v1.5 §7.7, §1.D.4; `DEC-012` Model C; `DEC-013` clause 5; Charter §6.3; Module Index TRE-01 | Internal matching, MB order book, principal dealing/liquidity, market making permanently prohibited in every environment; AIX inventory zero | "Treasury and liquidity integration"; a buyer-friendly complete venue | **Compatible** if treasury means external-LP funding and fee-side position management. **Real** only if internal matching or principal liquidity is sought | A reopening would change frozen decisions, the `exchange.*` namespace and `assertNoExchangeRuntime` | Do **not** reopen; the sanctioned route to own matching is the separate Exchange domain (`EXO-01`), production-gated. Keep TRE-01 scoped to external funding | No |
| C-5 | (a) Doc 00 v1.5 **§8.1 item 5 "Securities token trading"**, classified **E — "Remains locked"** in §8A, under the §8.1 lead-in "must not be developed or activated"; (b) Doc 00 **§12.1 items 1–2** ("Do not build active exchange order-book features / active matching engine"); (c) Doc 00 §8.1 items 10, 13 | (a)–(b) read literally forbid development of securities token trading and of an order book / matching engine. (c) are unqualified, while §20.6 qualifies them | `DEC-013` clauses 7 and 9, Doc 00 **§12E** (build and test authorised against synthetic instruments), §9A (`securities.token_trading` restated as *live securities trading in PRODUCTION*, fail-closed pending `R4-Q2`, `R1-Q1b`) and §20.5 authorise Exchange and security-token build in DEV/TEST/UAT/DEMO | **Wording inconsistency inside an approved master, not caused by the mandate.** The intended meaning is recoverable from §9A and §12E (production lock, not a build ban), but (a) and (b) were not re-scoped when v1.5 was written. (c) is already recorded in `CURRENT_STATE.md` §9; (a) and (b) are not | A literal reading blocks Exchange work `DEC-013` authorises; agents may stall or mis-resolve it. **Unchanged under every reading:** internal MB Spot client-to-client matching, an MB Spot order book or matching engine, and securities-featured assets on the Money Broking route stay prohibited in every environment (Doc 00 §7.7, §12A, §12E.4; `DEC-013` clause 5). `EXO-01` serves the Exchange domain only | Follow `DEC-013` and §12E (later, specific, accepted decision) and keep every MB Spot prohibition. Raise a controlled Doc 00 wording clarification. **No amendment here; Doc 00 not modified** | **Yes — D-3** (clarification task) |
| C-6 | Charter v1.5 §15.0, §15.3; recorded review series (ACC-01 ten rounds, AST-01 nine, DEC-015 three) | No coding before a reviewed blueprint; no fixed review limit exists | Stopping criteria; no repeat audits without new evidence; proportionate effort | **Compatible in principle; tension in practice.** The mandate keeps §15.3 intact | Long review series consume cost without a stated end; no rule defines "enough" | After acceptance of this mandate, add stopping criteria to `CLAUDE_CODE_USAGE_RULES.md` / task templates through a separate documentation task | **Yes — D-4** |
| C-7 | Doc 00 v1.5 §1.E rule 6, §23 `R6-Q1`; `DEC-013` | External DEMO exposure of Exchange/RWA capabilities fails closed until `R6-Q1` is answered; internal controlled demo permitted | Controlled demonstration to an institutional buyer | **Real for gated capabilities shown externally;** compatible for ungated capabilities and internal demos | A sale process cannot show production-gated capabilities to outsiders on current rules | Plan demos around internal/ungated capabilities; obtain a qualified regulatory view before any external demo of gated capabilities. This mandate answers nothing | **Yes — D-5** (before any external gated demo) |
| C-8 | `DEC-015` (`STR-04` v0.4) NOT_ACCEPTED; Doc 00 §8.2; Charter §9 | Fiat banking, virtual accounts, custody and settlement architecture is a proposal | Target areas "custody integration", "fiat and virtual account integration", "payout orchestration" | **Compatible**, but dependent. These areas cannot be treated as settled design | LED-01, DEP-01, WDR-01 and related blueprints should not freeze provider ownership until `DEC-015` or a successor is decided | No change here. Round-4 review remains a separately authorised task | Existing (Round-4 authorisation); nothing new |
| C-9 | Charter v1.5 §4, §18 (1,000+ users, 99.9%, RPO/RTO) | Stated planning targets, "may be refined after load testing" | "No speculative scaling" | **Compatible.** Charter §18 is the credible workload assumption | None | Treat §18 as the baseline; refine through IMP-02 measurement, not new infrastructure | No |

## 16. Success and completion criteria

The product mission (§3) is met only when **all** of the following hold, each evidenced in the
repository and none inferred from another:

1. Every in-scope capability in §6 is classified, and each approved-build or approved-existing one
   satisfies §4 (definition → delivery).
2. Cross-module end-to-end testing (§10) passes in a non-production environment with synthetic
   data and test adapters; no simulated integration is represented as real.
3. Operational readiness (§11) is demonstrated, including a rehearsed restore.
4. Handover materials (§12) exist and a buyer-side acceptance criterion set is agreed.
5. All architecture boundaries (§8) are intact; no guard, gate or locked classification was weakened.
6. Open HIGH/BLOCKER findings relevant to the delivered scope are closed on evidence, or
   explicitly accepted by the owner with the risk recorded. **Exception:** a HIGH/BLOCKER finding
   involving a mandatory security, financial-integrity or production-exposure control cannot be
   waived by owner risk acceptance while the affected capability is declared technically ready.
   The control must be met, or the affected functionality must remain excluded or safely disabled.
7. The owner has recorded acceptance at each stage gate that requires one.

**Completion of the above establishes technical delivery readiness only. It is not regulatory
approval, not authorisation to operate, and not activation of any production-gated capability
(stages F and G, §7).** There is no "finished" state beyond these criteria; once they are met,
further work is maintenance and new, separately approved scope.

### Owner decisions (D-1 to D-5 open; D-6 closed)

| ID | Decision | Needed before |
|---|---|---|
| D-1 | Relationship of the software to any licensed operator; wording of Charter §4 / Doc 00 §1.C | Any binding operator-specific commitment, any operator-specific deployment or live regulated deployment, or any representation of regulated operating authority. **Not** required for ordinary commercial discussions about the independently developed software, which must not imply operating authority (§2) |
| D-2 | Whether and how a second operator is supported (multi-operator configuration) | Committing to a second-operator design |
| D-3 | Controlled clarification of Doc 00 §8.1 item 5, §12.1 items 1–2 and §8.1 items 10, 13 | Exchange-domain build tasks relying on a literal reading |
| D-4 | Adopt review stopping criteria in the usage rules and task templates | The next multi-round review |
| D-5 | Regulatory view on `R6-Q1` | Any external demo of production-gated capabilities |
| D-6 | Acceptance of this mandate | **Closed — owner accepted 2026-10-21** |
