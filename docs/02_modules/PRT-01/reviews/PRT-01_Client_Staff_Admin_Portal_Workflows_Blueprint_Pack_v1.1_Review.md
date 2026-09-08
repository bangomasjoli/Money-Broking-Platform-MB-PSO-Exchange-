# Principal Fintech Platform Architect Review — Final Verification

## Document Reviewed: PRT-01 Client / Staff / Admin Portal Workflows v1.1

| Item | Details |
|---|---|
| Reviewed pack | PRT-01 Client / Staff / Admin Portal Workflows Blueprint Pack v1.1 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2; all module deps cited v1.2 (E2E/DEP/WDR/REC/INC accepted v1.1; compliance/money tier substantively v1.1 — see Consistency Note) |
| Module category | Portal / UX / Workflow Presentation — the platform's only end-user surface |
| Review type | Principal Fintech Platform Architect — Final Verification |
| Verdict | **All 5 critical gaps resolved; all 6 recommended corrections landed.** Principles 14 → 25 (§5.15–5.25); FR 18 → 32; prohibited 28 → 48; components 17 → 31; schema tables 6 → 11; tests 32 → 78; new internal control API surface + audit event set. **Acceptance-ready.** One cosmetic version-cell nit only. |

---

## 0. Summary

Final verification pass on PRT-01, the presentation layer and the last module in the build. The v1.1 revision closes every portal-class gap from the v1.0 review with a matching principle (§5.15–5.25), functional requirement (FR-019–032), schema table/column set, prohibited-behaviour entry (#29–48), reconciliation check, audit event, internal control API, and test section. The suite expanded from **32 (TC-001–032) to 78 (TC-001–078)** across seven new sections mapping one-to-one onto the gaps and corrections.

The two things a money-platform portal uniquely gets wrong — a display that lies *truthfully*, and a browser that is the untrusted actor — are now both mechanised. Display truth is version-bound with overlay precedence and fail-closed-to-less-favourable; the browser is an explicit hostile-input boundary with server-bound economics; the read path has object-level authorization; freeze/revocation reaches the portal by push; and export is hardened into a single-use, recipient-bound, disclosure-logged egress. PRT-01 no longer *reintroduces* risk at the one boundary the end user touches.

---

## 1. Critical Gaps — Resolution Status

| # | Prior Gap | Status | Evidence in v1.1 |
|---|---|---|---|
| C1 | Status truthfulness asserted but not mechanised; forward-only cache lets a since-regressed status show as truthful (HIGHEST) | **Resolved** | **§5.15 Display Truth Non-Regression Model** — every displayed status binds to source module + object ID + **monotonic status version/epoch**; portal compares cached vs current epoch before sensitive display; **never renders more favourable/advanced than current source**; stale/absent/downgraded/unreachable → **fail-closed to less-favourable/unavailable/pending**; explicit **overlay precedence** (freeze → revocation → quarantine → reversal/return/clawback → restatement → REC critical) always suppresses a cached positive. `display_status_cache` gains `source_status_version`/`overlay_epoch`/`non_regression_status`; components **Display Truth Engine** + **Source Status Version Adapter**; **FR-019/020**; prohibited #29/#31; data rules 7/14; `POST /internal/prt1/display/validate-truth`; tests **TC-033–038** |
| C2 | Read-path/object-level authorization unmodelled — IDOR/BOLA + service-account confused deputy | **Resolved** | **§5.16 Object-Level Read Authorization** — client reads only own authorised objects; **path IDs/source refs never trusted**; staff scoped to assigned case/mandate (not role-wide enumeration); **portal service account calls re-scoped to end-user entitlement**; source receives end-user subject + entitlement scope + correlation; role permission alone insufficient. New **`object_entitlement_check`** table; `portal_session_context.data_scope_hash`; `portal_action_request.end_user_entitlement_hash`; components **Object Entitlement Engine** + **Service Account Re-Scoping Adapter**; **FR-021/022**; prohibited #32/#33/#34; data rule 8; `POST /internal/prt1/object-authorize`; tests **TC-039–043** |
| C3 | Freeze/revocation/restatement reaches portal by polling only — racy vs INC-01 verified-effective freeze | **Resolved** | **§5.17 Push Invalidation / Revocation Subscription** — sessions subscribe to an **invalidation-epoch stream**; INC freeze, AML/WLT revocation, REC restatement, DEP reversal, WDR return, TRD bust, LED correction each increment the relevant epoch; active sessions + caches invalidate immediately; **loss of subscription → fail-closed degraded display**; stale epoch blocks sensitive display/action until revalidated; dashboards cannot show green if feed unavailable. New **`invalidation_epoch`** table; `portal_session_context.invalidation_epoch`; component **Invalidation Subscription Service**; **FR-023**; prohibited #35; data rule 9; `GET .../dashboard?as_of_epoch=` + `POST /internal/prt1/invalidation-events`; tests **TC-044–048** |
| C4 | Export/evidence egress thinnest-specified — no source-side masking, single-use token, disclosure log, post-approval recheck | **Resolved** | **§5.18 Export / Evidence Egress Hardening** — masking applied by **REC/SEC/INC/source policy engine, never portal/browser**; portal never receives unauthorised unmasked payload; request captures **recipient + purpose + lawful/regulatory basis**; generation- and download-time **recheck** permission + freeze/legal-hold/tipping-off; **recipient-bound single-use expiring token**; watermark; **disclosure log**; re-download beyond ceiling needs new approval. New **`download_token`** table (`max_use_count` default 1); `export_request` gains recipient/purpose/basis/disclosure-log/watermark/generation+download-recheck columns; components **Export Egress Hardening Service** + **Download Token Service**; **FR-024**; prohibited #36/#37/#38; data rule 10; `POST /prt1/exports/{id}/download-token`; tests **TC-049–055** |
| C5 | Browser not modelled as hostile-input boundary — economics and uploads over-trusted | **Resolved** | **§5.19 Hostile Browser / Input Integrity Boundary** — client-posted economics never trusted; **quote acceptance binds to server-issued quote ID/hash/fee/amount/asset/destination/validity**, accepted economics retrieved from TRD server record not browser payload; file uploads require type/size/**malware scan**/content-type verify/parser hardening; CSV-injection neutralised; SSRF/path-traversal blocked; CSRF/clickjacking/session-fixation/output-encoding required; rendered client-safe message integrity protected. New **`upload_intake`** table; components **Hostile Input Guard** + **Quote Acceptance Binding Guard**; **FR-025/026**; prohibited #39/#40/#41/#42; data rule 11; `POST /internal/prt1/uploads/scan` + `.../quote-acceptance/verify-binding`; tests **TC-056–064** |

---

## 2. Recommended Corrections — Resolution Status

| # | Correction | Status | Evidence |
|---|---|---|---|
| 1 | Notification supersession + reconcile-before-send | **Resolved** | **§5.20** each notification carries source object + source version + notification version; **reconciled against current source truth before send**; stale-favourable suppressed/superseded; reversal/restatement/return supersedes prior paid/credited/settled; mandatory regulatory notices non-opt-out. New **`notification_outbox`** (`supersedes_notification_id`/`reconcile_before_send_status`); component **Notification Supersession Engine**; **FR-027**; prohibited #43; data rule 12; `POST /internal/prt1/notifications/reconcile-before-send`; tests TC-065/066 |
| 2 | Step-up bound to action, not just recency | **Resolved** | **§5.21** step-up freshness by action risk tier; **high-value payout binds step-up to action + amount + destination** (dynamic linking); quote-acceptance step-up binds to quote ID/hash; export step-up binds to scope + recipient; unrelated/stale MFA cannot authorise a new sensitive action. Component **Dynamic Step-Up Binding Service**; **FR-028**; prohibited #44; tests TC-067/068 |
| 3 | Disclosed-fee display truthfulness | **Resolved** | **§5.22** quote/trade screen shows disclosed fee **from TRD/LED source record**, itemised; **no AIX spread markup displayed/configured**; accepted economics = disclosed economics; **fee shown = fee charged in LED**. **FR-029**; prohibited #45; `PRT1_DISCLOSED_FEE_MISMATCH`; tests TC-069/070 |
| 4 | Structurally separate client-safe channel from internal reasons | **Resolved** | **§5.23** client-facing messages render **only approved templates keyed to a client-safe reason-code catalogue**; internal AML/security/compliance reasons stored separately; **client channel cannot read internal reason field/store**; free-text to client prohibited for restricted categories. `message_template.client_safe_reason_code` + `internal_reason_ref_allowed` (must be false for client templates); component **Client-Safe Reason-Code Service**; **FR-030**; prohibited #46; tests TC-071/072 |
| 5 | Correlation-ID propagation into every source call + SEC event | **Resolved** | **§5.24** every sensitive action creates/receives FND correlation ID, **stored on portal action, propagated to source call, emitted in SEC event**; **E2E registry includes portal-originated actions**; missing correlation ID blocks the action. `portal_action_request.correlation_id` + `object_entitlement_check.correlation_id`; component **Correlation Propagation Adapter**; **FR-031**; prohibited #47; data rule 13; tests TC-073–075/077 |
| 6 | "Source unavailable ≠ all-clear" degraded-display rule | **Resolved** | **§5.25** source unavailable → **"status unavailable / cannot confirm"**; stale-positive suppressed; affordances requiring confirmable status disabled; **dashboards show degraded/unknown, not green**; degraded display audited; recovery triggers revalidation. Component **Degraded Display Controller**; **FR-032**; prohibited #48; tests TC-048/076 |

---

## 3. Additional Verification — Propagation Depth

- **Reconciliation (file 13 §4)** — strengthened from "displayed-final matches source" to eleven v1.1 checks that operationalise the review's ask: *never more favourable than source*, *version/epoch checked*, *overlay applied*, *object entitlement decided*, *service call re-scoped*, *source-side masking + disclosure log*, *recipient-bound single-use token*, *quote economics matched*, *notification reconciled before send*, *correlation carried to source + SEC*, *missing feed shown degraded*. PRT-01 now reconciles against the E2E/SEC denominator (TC-077/078), closing the "portal outside the denominator" note from v1.0.
- **Audit (file 08)** — event set 13 → 28, adding non-regression suppression, overlay-applied, object-authorization-denied, invalidation-received/lost, disclosure-logged, token-issued/reused, quote-binding-failed, upload-rejected, notification-superseded, dynamic-step-up, correlation-propagated, degraded-display; critical-alert list 5 → 12 (BOLA/IDOR, token replay, economics tampering, stale-positive suppressed, subscription lost, unsafe upload).
- **API (file 04)** — added `?as_of_epoch=`, a dedicated download-token endpoint, six `/internal/prt1/*` control APIs (invalidation-events, validate-truth, object-authorize, reconcile-before-send, uploads/scan, quote verify-binding), and ~19 new precise error codes. The internal control surface makes each principle independently testable rather than aspirational.

The propagation is uniform: every gap and correction is realised in principle → schema → component → FR → prohibited behaviour → reconciliation check → audit event → error code → test. Nothing is declared without a mechanism behind it.

---

## 4. Remaining Items (cosmetic — non-blocking)

1. **`01` §1 Document Control** shows `Pack version | v1.0` while this is the v1.1 pack (the Status line correctly records the revision — "Revised after Claude Opus review; …"). Ironically the v1.0 pack had the correct cell; the recurring version-cell miss reappeared here. A clean rollup closes it.
2. **Version pinning.** The dependency list cites all upstreams at **v1.2 including E2E-01/DEP-01/WDR-01/REC-01 v1.2** (accepted at **v1.1**; their v1.2 are clean rollups) and CLT/KYC/AML/WLT/LED substantively at **v1.1** (TRD-01 genuinely v1.2). Pin to accepted versions or mark as forward references.

No control is affected.

---

## 5. Verdict

PRT-01 v1.1 is **substantively resolved and acceptance-ready.** The most serious gap — C1, a portal that could display a "paid / credited / settled" status that was true when cached but which the source has since reversed, returned, frozen or restated — is now closed with a mechanised truth model: every displayed status is bound to a monotonic source version/epoch, the portal never renders a status more favourable or advanced than the source currently asserts, stale/absent/unreachable source **fails closed to the less-favourable state**, and a strict overlay precedence (freeze → revocation → quarantine → reversal → restatement → REC critical) always suppresses a cached positive. The other four are equally closed: object-level read authorization with path-ID distrust, case/mandate scoping and service-account re-scoping (C2, defeating IDOR/BOLA and the confused deputy); a push invalidation-epoch subscription that makes the portal a genuinely frozen surface consistent with INC-01's verified-effective freeze, fail-closed on subscription loss (C3); an export egress hardened with source-side masking, recipient-bound single-use expiring tokens, a disclosure log, and generation-and-download-time rechecks (C4); and an explicit hostile-browser boundary where client-posted economics are rejected in favour of the server-issued quote and uploads are scanned and sanitised (C5).

All six corrections landed, including notification supersession/reconcile-before-send, action-and-amount-bound step-up (dynamic linking), disclosed-fee display truthfulness (the portal is the agency-model disclosure surface, and the fee shown must equal the fee LED charges), structural separation of the client-safe channel from internal reason codes, correlation-ID propagation that finally brings portal-originated actions into the E2E/SEC reconciliation denominator, and the "source-unavailable is never all-clear" degraded-display rule. Coverage expanded 32 → 78 tests across seven new sections, the reconciliation design gained eleven portal-integrity checks, and the audit set nearly doubled.

PRT-01 is now a presentation layer that cannot *reintroduce* risk at the boundary the end user touches: it displays only what the source currently asserts and never something more favourable, authorises every object read, freezes in step with the platform, hardens its highest-consequence data egress, treats the browser as hostile, and stamps every action into the correlation spine — while, as required, owning no ledger, balance, decision or source-of-truth record.

Recommend: **accept PRT-01 at v1.1** (a clean v1.2 rollup can fix the version-cell nit and repin the baseline).

**The platform blueprint chain is now review-complete.** With PRT-01 accepted, every module — control plane (FND-01, IAM-01, IAM-02, SEC-01, CFG-01), compliance sub-tier (CLT-01, KYC-01, AML-01), money tier (WLT-01, LED-01, TRD-01), integration (E2E-01), execution rails (DEP-01, WDR-01), reconciliation/finance (REC-01), incident/freeze/recovery (INC-01), and now the presentation layer (PRT-01) — is review-complete and accepted. The entire money, control, and interaction surface of the AIX Money Broking + PSO platform is fully specified.
