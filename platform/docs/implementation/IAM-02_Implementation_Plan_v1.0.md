# IAM-02 RBAC / Permission Guard / SoD — Implementation Plan (v1.0, planning only)

| Item | Detail |
|---|---|
| Module | IAM-02 RBAC / Permission Guard / Segregation of Duties |
| Blueprint | `aix-platform-docs/modules/IAM-02_RBAC_Permission_Guard_SoD_Blueprint_Pack_v1.2/` (accepted, final verified) |
| Dependencies | FND-01 v1.2 (accepted baseline v1.0), IAM-01 v1.2 (accepted baseline v1.0, C1 fixed) |
| Status | Planning only — no code, migrations, or files created this pass |
| Model | Planned on Claude Sonnet, per project model-usage rule (Opus reserved for post-implementation review) |

Prepared after reading `PROJECT_HANDOVER.md`, `MODULE_STATUS.md`, `SESSION_START_PROMPT.md`,
`FND-01_IMPLEMENTATION_NOTES.md`, `IAM-01_IMPLEMENTATION_NOTES.md`, the full IAM-02 v1.2 pack
(blueprint, API spec, DB design, permission rules, audit events, error handling, test cases,
go-live checklist), and the actual FND-01/IAM-01 code (`errors.ts`, `internal-identity.ts`,
`outbox.ts`, `step-up.ts`) to ground this in real patterns rather than the blueprint alone.

**Headline observation:** IAM-02's blueprint is dramatically larger than IAM-01's — 30 FRs, 19
tables, 94 test cases, 39 go-live gates, and control machinery (approval-payload-hash binding,
permission decision tokens, SoD risk-acceptance, meta-SoD, break-glass ceiling) with no IAM-01
precedent. Building all of it in one pass, the way FND-01/IAM-01 mostly were, is not realistic
or safe. §9 proposes a two-slice split and flags it as a decision for the product owner, not
something decided unilaterally here.

---

## 1. Proposed implementation plan

**New service, not an extension of `services/iam`.** The blueprint is explicit: schema `iam2`,
runtime role `role_iam2_runtime`, "other modules call IAM-02 service interfaces… direct
cross-schema permission writes are prohibited." This mirrors the IAM-01/FND-01 relationship
(separate schema, separate runtime role, F3(a)-style cross-schema denial), except the boundary
is cross-*service* too — IAM-02 must call IAM-01's existing `POST /internal/auth/verify-assertion`
over HTTP (internal-identity-guarded, exactly like `step-up.ts` already does for its own
callers) rather than importing `services/iam/src/**`. This gives IAM-02 the same F3(c)
import-boundary test IAM-01 has, extended one level.

**Phase 0 — scaffold** (mirrors FND-01/IAM-01 bootstrapping)
- `services/iam2/` package (`@aix/service-iam2`), `package.json`, `tsconfig.json` reference
  added to root `tsconfig.json`.
- `server.ts`/`index.ts`/`config.ts` following `services/iam`'s shape (Fastify 5, TypeBox,
  `removeAdditional: false` override, log redaction list).
- `plugins/request-context.ts` (copy pattern, not import — same F3(c) discipline).
- IAM-02's own internal-identity guard copy (`plugins/internal-identity.ts`, same
  constant-time-compare pattern) for its own `/internal/iam2/*` endpoints, until superseded by
  real service identity (§5).

**Phase 1 — schema, grants, catalogues**
- Migration `005_iam2_core.cjs`: schema `iam2` + tables `role`, `permission`, `role_permission`,
  `user_role`, `permission_cache_version` (the minimum needed for a working guard).
- `infra/grants/iam2_runtime_grants.sql`: `role_iam2_runtime`, `USAGE`+DML on `iam2.*` only,
  **INSERT-only** on `foundation.outbox_event` from day one (apply the C1 lesson immediately,
  don't repeat the mistake), and — the C2 decision point — a scoped grant on
  `foundation.idempotency_record` (see §7).
- Seed the canonical permission/role catalogue from `07_Permission_Rules.md` (namespace
  `<module>.<resource>.<action>`, the `iam2.*` admin permissions, and the `exchange.*`
  prohibited set marked `prohibited = true`, non-overridable per §5.12/§7 precedence).

**Phase 2 — permission guard (the core deliverable)**
- `lib/guard.ts`: `evaluatePermission(actorId, action, resource, entityId, clientId, context)`
  implementing the precedence chain from `07_Permission_Rules.md` §7 exactly in order:
  licence-lock deny → prohibited deny → account/session freeze deny → explicit deny override →
  SoD block → missing step-up → approval-required → temporary permission → delegated permission
  → role permission → default deny.
- `POST /internal/iam2/permission/check` (internal, called by every downstream module).
- `iam2.permission_decision_log` write on every decision (audit envelope via `publishAudit`).
- Default-deny fail-closed on: unknown permission, unknown role, licence-lock-source
  unavailable, SoD-matrix unavailable, cache unavailable — per `09_Error_Handling.md` §3.

**Phase 3 — approval-to-execution binding (Critical, do not defer)**
- `iam2.approval_request` / `approval_decision` / `permission_decision_token` tables.
- Payload-hash capture at approval creation, re-verification at
  `POST /internal/iam2/permission/execute-verify`.
- Decision-token issuance bound to `actor/session/action/entity/payload_hash/cache_version/
  approval/step_up`, short-lived, revalidated at execution.
- This is Phase 3 not Phase 6 deliberately — see §9: money-tier modules (LED/TRD/DEP/WDR)
  depend on this being *real*, not a placeholder, from their first integration.

**Phase 4 — maker-checker + SoD (blocking control)**
- `iam2.approval_policy`, SoD tables (`sod_rule`, `sod_check`), self-approval block, SoD
  conflict block at role/permission/approval/delegation time.
- Critical SoD = block-only (no risk acceptance path yet — that's Phase 6).

**Phase 5 — step-up + cache invalidation integration**
- Call IAM-01's `/internal/auth/verify-assertion` for `requires_step_up` permissions.
- `iam2.permission_cache_version` bump + positive-version check on every
  role/permission/user_role mutation.

**Phase 6 — delegation, temporary permissions, break-glass, SoD risk-acceptance, meta-SoD**
- These are real requirements but none of them block a downstream module's *basic* integration
  with the guard — they're additive control refinements. Full tables already scoped in Phase 1
  migration can be deferred to this phase's own migration if preferred (see §3 of the migration
  section below).

**Phase 7 — protected-action registry + reconciliation jobs + sensitive-read logging**
- `iam2.protected_action_registry`, orphan-action reconciliation job, `iam2.sensitive_read`
  logging on evidence-read endpoints.

**Phase 8 — tests, F3-equivalent boundary tests, runtime-role verification** (see §7)

**Phase 9 — implementation notes + internal review, then submit for Opus final review** (same
lifecycle as FND-01/IAM-01).

---

## 2. Minimum files likely to change

New (nothing existing touched except root wiring):
```
services/iam2/package.json, tsconfig.json
services/iam2/src/{index,server,config}.ts
services/iam2/src/plugins/{request-context,internal-identity}.ts
services/iam2/src/lib/{guard,catalogue,approval,sod,decision-token,break-glass,rate-limit}.ts
services/iam2/src/routes/{roles,permissions,approvals,sod,delegation,temporary-permissions,break-glass,evidence,internal}.ts
services/iam2/src/lib/errors.ts   (IAM2_* codes)
infra/migrations/005_iam2_core.cjs (+ 006_iam2_break_glass_sod.cjs if phased per §3)
infra/grants/iam2_runtime_grants.sql
tests/unit/iam2-*.test.ts
tests/integration/iam2-db.test.ts
tsconfig.json (root — add services/iam2 reference)
```
Existing files touched: **none** in `packages/foundation` or `services/iam` — IAM-02 only calls
IAM-01 over its existing HTTP surface (`/internal/auth/verify-assertion`, and possibly a new
read-only "get session auth-level" if the decision-token binding needs it — flagged as an open
question in §7).

---

## 3. Migration requirements (next migration = `005`)

Single `005_iam2_core.cjs` covering Phase 1–5 tables is the minimum for a working guard: `role`,
`permission`, `role_permission`, `user_role`, `user_permission_override`, `approval_policy`,
`approval_request`, `approval_decision`, `sod_rule`, `sod_check`, `permission_decision_log`,
`permission_decision_token`, `permission_cache_version`.

Recommend a **second migration `006_iam2_break_glass_delegation.cjs`** for the Phase 6 tables
(`delegation`, `temporary_permission`, `break_glass_request`, `sod_risk_acceptance`,
`break_glass_permission_whitelist`) and a **third `007_iam2_protected_action_registry.cjs`** for
Phase 7 (`protected_action_registry`). This mirrors IAM-01's own pattern (002 core → 003
RLS-fix → 004 MFA-enrolment) — additive migrations per capability slice rather than one giant
file, which also lets each slice ship/test independently.

RLS: unlike IAM-01, most `iam2` tables (`role`, `permission`, `role_permission`) are **not**
per-user-owned — they're global catalogues, so ownership-RLS doesn't apply. Tables that ARE
actor-scoped (`user_role`, `user_permission_override`, `temporary_permission`, `delegation` by
`delegate_user_id`) should get the same `ENABLE + FORCE RLS` ownership pattern IAM-01 uses,
**and** — learning directly from S1 — any pre-auth-shaped lookup (e.g. resolving a
`permission_decision_token` by its hash before the owner is known, exactly analogous to IAM-01's
token-hash lookups) must go through a `SECURITY DEFINER` function from the start, not be
discovered as a deploy-blocker after the fact. This is the single most important lesson to
carry forward mechanically.

---

## 4. Permission / RBAC / SoD model proposal

- **Namespace**: adopt `07_Permission_Rules.md` literally — `<module>.<resource>.<action>`
  (e.g. `wdr.withdrawal.approve`, `iam2.role.assign_user`).
- **Precedence**: implement `07_Permission_Rules.md` §7's 11-step chain as a single ordered
  function, unit-tested step-by-step (each precedence rule gets its own test forcing that exact
  rule to be the deciding one — this is how the chain's ordering gets verified, not just each
  rule in isolation).
- **Default deny** is structural: `evaluatePermission` returns `deny` unless it reaches an
  explicit `allow` at the role-permission step; every fail-closed branch (unknown permission,
  unavailable SoD matrix, etc.) short-circuits to `deny` before reaching role lookup.
- **SoD**: `sod_rule` conflict pairs checked at role-assignment, permission-assignment,
  approval-decision, and delegation-creation time (4 of the 6 blueprint-listed enforcement
  points in Phase 1-4; runtime action-time and temporary-permission-grant-time SoD checks land
  in Phase 6 alongside those tables).
- **Meta-SoD** (§5.6A.7 — matrix editor ≠ role/permission assigner): enforced as a
  permission-catalogue-level SoD rule on IAM-02's own admin permissions (`iam2.sod.manage`
  conflicts with `iam2.role.assign_user`/`iam2.permission.assign_role`) — i.e. IAM-02 governs
  itself using its own SoD engine, no special-case code path.

---

## 5. Service-identity replacement plan

IAM-01's `plugins/internal-identity.ts` is explicitly documented as "an interim seam… will be
replaced by real IAM-01 service identity + IAM-02 permission guard." The replacement, scoped to
what IAM-02 can actually do:

1. IAM-02 introduces `service` as a first-class actor type in its permission model (already
   anticipated — `role_type: system/service` in `iam2.role`, and blueprint actors table lists
   "Service Account").
2. Internal service-to-service calls (IAM-01 ↔ IAM-02, and later any module ↔ IAM-02) move from
   a single shared static token to per-caller scoped credentials checked against
   `iam2.role_permission` for a `service` role — i.e. the guard itself becomes the
   internal-identity mechanism, rather than a bypass-shaped shared secret.
3. This is realistically a **Phase 6/7 item**, not Phase 0 — IAM-02 needs its own guard working
   before it can be the thing that authorizes other services. Until then, IAM-02's own
   `/internal/iam2/*` endpoints keep a copy of the same interim shared-token guard pattern
   (consistent, not a regression), clearly commented as "replaced once the guard can self-host
   service-identity."
4. Recommend **not** touching IAM-01's `internal-identity.ts` in this module at all — replacing
   its *usage* happens gradually as each internal caller migrates to a real permission-checked
   service credential; ripping it out on IAM-02 day one would break IAM-01 unnecessarily.

---

## 6. Break-glass admin replacement plan

The FND-01/IAM-01 break-glass bootstrap admin (`lib/bootstrap.ts`, `is_interim_admin` flag) is a
one-time-only seam to get the *first* human into the system before any RBAC exists. IAM-02's
break-glass (§5.13, `iam2.break_glass_request`) is a *different, permanent* thing — ongoing
emergency access, not bootstrapping.

Replacement sequencing:

1. **Do not touch `lib/bootstrap.ts` in Phase 1-5.** The interim bootstrap admin still needs to
   exist until IAM-02's role/permission assignment is itself working (chicken-and-egg: you need
   an admin to assign the first real roles).
2. Once Phase 2 (permission guard) + Phase 4 (maker-checker) are live, the bootstrap admin's
   `is_interim_admin` flag becomes the trigger for a **one-time transition workflow**: assign
   the bootstrap admin a real IAM-02 role via a break-glass-equivalent path (self-bootstrapping
   the RBAC catalogue necessarily requires *someone* to make the first assignment without a
   pre-existing approver — this is a known hard problem, flagged as an open question in §7, not
   solved here).
3. Once the first real Security Admin / Tech Admin role assignment is confirmed, `bootstrap.ts`'s
   create-once guard naturally stops mattering (no more empty-`user_identity` state), and
   `is_interim_admin` can be documented as permanently retired for that account (not deleted —
   audit trail).
4. IAM-02's own break-glass (Phase 6) is unrelated to this transition — it's the ongoing
   "emergency access to a whitelisted permission set, approved-by-non-recipient, time-boxed"
   capability for steady-state operations, built per §5.13 independent of the bootstrap story.

---

## 7. C2 idempotency isolation — options and recommendation

**The problem restated:** `foundation.idempotency_record` is shared infrastructure; every
module doing `beginIdempotent`/`completeIdempotent` needs `SELECT, INSERT, UPDATE` on it, so
any module's runtime role can currently read/alter any other module's idempotency rows. IAM-02
becoming a third consumer (after FND-01/IAM-01) is exactly the trigger IAM-01's final review
flagged for deciding this "before the pattern proliferates."

**Options:**

- **(a) RLS by `source_module`/actor** — add a `source_module` column, `ENABLE + FORCE RLS`
  with a policy keyed to a `SET LOCAL aix.module` (analogous to `aix.user_id`), grant each
  runtime role only its own module's `set_config` value. Cheapest schema change (one column +
  one policy), reuses the exact pattern already proven in IAM-01, and doesn't touch
  `enqueueOutbox`'s sibling contract. **Recommended.**
- **(b) Per-module idempotency tables** — `iam2.idempotency_record`, `iam.idempotency_record`,
  etc. Cleanest isolation but means changing `beginIdempotent`/`completeIdempotent` in
  `@aix/foundation` to be schema-parameterized (touches accepted FND-01 code, more invasive than
  option a, and duplicates a table 6+ times across the eventual module set).
- **(c) Accept as trusted-infra, document the risk** — do nothing, note it as an accepted
  platform-level residual risk. Weakest option for a regulated platform building a
  *permission/SoD* module whose entire purpose is precisely "don't let one actor read/touch
  another's records."

**Recommendation: (a).** It's a small, additive migration to `foundation.idempotency_record`
(not a rewrite), directly reuses the RLS pattern already reviewed and accepted for IAM-01, and
closes C2 before IAM-02 lands rather than carrying it further. This should be scoped as its own
small patch — analogous to the C1 patch — applied to the `foundation` package/migrations,
verified against both the FND-01 and IAM-01 suites (same discipline as C1's re-verification),
*before* IAM-02's Phase 1 migration grants itself access to the table.

---

## 8. Tests likely needed

- **Unit**: guard precedence chain (11 ordered rules, one test forcing each rule to be the
  deciding factor), permission-namespace validation, SoD conflict matrix matching, payload-hash
  canonicalisation, decision-token binding/expiry logic, error-catalogue completeness.
- **Integration (DB-gated, `role_iam2_runtime`-connected from day one — not superuser, learning
  directly from S1)**: IAM2-TC-001 through IAM2-TC-094 from `10_Test_Cases.md` map almost 1:1 to
  integration describe-blocks: permission guard (TC-001–008), role/permission assignment + cache
  invalidation (TC-009–016), maker-checker + self-approval (TC-017–024), SoD (TC-025–030),
  delegation/temp-permission (TC-031–037), break-glass (TC-038–045), client dual-auth
  (TC-046–050), cache/revocation (TC-051–055), sensitive-read/evidence (TC-056–060),
  service-account (TC-061–064), approval-execution binding (TC-065–071 — the
  payload-hash-mismatch-blocks-execution test is Critical), protected-action registry
  (TC-072–075), SoD-risk/meta-SoD (TC-076–080), break-glass ceiling (TC-081–085), interim
  CFG/SEC contracts (TC-086–094).
- **Boundary tests** (F3-equivalent, extended cross-service): (a) `role_iam2_runtime` denied on
  `foundation.*` beyond the approved narrow interface and denied on `iam.*`; (b)
  missing-actor/missing-client-scope fails closed; (c) import-boundary lint proving
  `services/iam2/src/**` never imports `services/iam/src/**` or `services/fnd/src/**` directly
  (only `@aix/foundation` bare specifier + HTTP calls to IAM-01's public routes).
- **Cross-service integration test**: IAM-02 guard call → step-up-required permission → calls
  IAM-01's real `/internal/auth/verify-assertion` → correct allow/deny — this is new (IAM-01 has
  no analogous "calls another service" test).

---

## 9. Risks / questions before coding

1. **Scope-vs-safety tradeoff (the big one):** should Phase 1 build the *entire* v1.2 blueprint
   (94 tests, 39 go-live gates) before any downstream module integrates, or ship a working core
   (guard + approval-binding + maker-checker + SoD-block, Phases 0-5) first and treat
   delegation/temp-permissions/break-glass/SoD-risk-acceptance/meta-SoD (Phase 6-7) as a
   documented, tracked follow-up — the same "core now, gaps closed in a dated follow-up pass,
   then Opus final review" rhythm FND-01 and IAM-01 both actually used? The phased approach is
   recommended, with Phase 3 (approval-payload-hash + decision-token) flagged as **not
   deferrable**, because downstream money modules need the *real* binding, not a placeholder,
   from their first integration — but the overall split is a product-owner decision, not one
   made unilaterally here.
2. **Bootstrap-to-RBAC transition** (§6.2): the very first real role/permission assignment has
   no pre-existing approver to satisfy maker-checker. Needs an explicit decision on the one-time
   transition mechanism (a config-sealed "first assignment" allowance, analogous to IAM-01's
   break-glass bootstrap, or something else) before Phase 4 lands.
3. **C2 must land before Phase 1's grant file is written** (§7) — otherwise IAM-02 becomes the
   third consumer of the unscoped table and the isolation gap widens further.
4. **Where does the canonical SoD matrix / role list / permission namespace actually come from?**
   The blueprint's own §13 "Open Items" lists "final canonical role list," "final SoD matrix,"
   "final permission namespace" as unresolved — these need a source-of-truth decision (a seed
   data file reviewed by Compliance/Security, per the blueprint's own governance rules) before
   Phase 1's seed data can be written; this should not be invented unilaterally during coding.
5. **Decision-token / auth-level binding**: `permission_decision_token` binds to IAM-01's
   `auth_level` — does IAM-01 currently expose auth-level anywhere machine-readable beyond the
   step-up assertion's own `auth_level` field? (It does, on the assertion — but ordinary session
   auth-level for non-step-up actions may need a small read-only addition to IAM-01, which would
   be the one exception to "don't touch services/iam.") Needs confirming before Phase 3.
6. **Interim CFG-01 licence-lock config-sealed list** (§5.14): needs the actual sealed list
   matching Document 00 v1.3 supplied/reviewed, not fabricated during coding.

---

## 10. Go/no-go recommendation

**Conditional GO** — proceed to coding **Phases 0–5** (scaffold → schema/grants → guard →
approval-binding → maker-checker/SoD → step-up/cache-invalidation) as the first implementation
pass, on these conditions:

- C2 (idempotency isolation, option a) is patched and re-verified against FND-01 + IAM-01 first,
  before IAM-02's grant file is written.
- Risk #2 (bootstrap-to-RBAC transition mechanism) and #4 (canonical role/permission/SoD-matrix
  source) get an explicit decision from the product owner before Phase 1 seed data is written —
  these are not to be invented during coding.
- Phases 6-7 (delegation, temporary permissions, break-glass, SoD risk-acceptance, meta-SoD,
  protected-action registry) are explicitly documented as a **second gap-closing pass**, tracked
  the same way IAM-01's S1/S2/password-reset gaps were, not silently dropped.
- Coding proceeds on **Sonnet**, per the project model-usage rule; Opus is reserved for the
  final security/compliance review once Phase 0-5 (or whatever slice is approved) is complete
  and self-tested.

No code, migrations, or files were created in this planning pass.
