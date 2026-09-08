# Principal Fintech Platform Architect Review

## Document Reviewed: PRT-01 Client / Staff / Admin Portal Workflows v1.0

| Item | Details |
|---|---|
| Reviewed pack | PRT-01 Client / Staff / Admin Portal Workflows Blueprint Pack v1.0 (16 files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2; all module deps cited v1.2 (E2E/DEP/WDR/REC/INC accepted v1.1; compliance/money tier substantively v1.1 — see Consistency Note) |
| Module category | Portal / UX / Workflow Presentation — the platform's only end-user surface |
| Review type | Principal Fintech Platform Architect — Initial (v1.0) |
| Verdict | **Strong first draft; accept-in-principle subject to five critical gaps.** The pack correctly refuses to own truth and enforces backend revalidation, tipping-off-safe messaging, masking, freeze-awareness and the Exchange lock. The residual gaps are portal-class-specific: the display layer is a *falsification and exfiltration surface*, and the browser is a *hostile-input boundary* — both under-modelled relative to the money surface behind them. |

---

## 0. Summary

PRT-01 is the last module in the build and the least control-critical by design: it owns no regulated decision and no financial state, and the pack is disciplined about saying so (5.1 Portal Is Not Source of Truth, 5.3 "frontend hiding a button is not a control", 5.13 admin-not-superuser, 11 prohibited behaviours). That discipline is exactly right and rare in a portal spec.

The gaps below are therefore not about missing features — they are about the two things a money-platform portal uniquely gets wrong: (1) it **displays** statuses, and a display can lie *truthfully* (show a status that was real at cache time but the source has since reversed/frozen/restated); and (2) it is **reached by the end user's browser**, which is the one untrusted actor with a direct incentive to tamper with economics, read another client's data, or replay an approved export. The v1.0 draft states the right principles for both but stops at *assertion* — it lacks the enforcing mechanism (a non-regression truth model, an object-level authorization model, a push-invalidation channel, a hardened export path, and a hostile-input boundary). Those are the five critical gaps.

---

## 1. Critical Gaps

### C1 — Status truthfulness is asserted but not *mechanised*: the display path can show a stale-favourable status the source has since regressed (HIGHEST PRIORITY)

**Area:** 5.2 Status Truthfulness · 05 §2.3 `display_status_cache` · 06 §4 Display Status State · WF-PRT01-01.

The pack forbids showing success before finality (good) but models display truth as a **forward-only freshness** problem: `display_status_cache` has `cache_expiry_utc` + `status_hash`, and the state machine is `fresh → stale → refreshed`. Money statuses do not move forward-only. They **regress**: credited → reversed/clawed-back, paid → returned, cleared → frozen, final report → restated, trade settled → busted. A cache entry that is *not yet expired* but whose source has regressed is a status that looks truthful and is a lie — the highest client-harm and mis-selling vector the portal has, and the one thing the portal exists to get right.

Missing mechanism:
- No binding of a displayed status to a **source status version/epoch** (monotonic sequence per source object), so the portal cannot detect that the source has moved *backwards* relative to what it cached.
- No **non-regression / never-show-more-favourable-than-source** rule: the portal must never render a status *more advanced or more favourable* than the source currently asserts.
- No **fail-closed-to-less-favourable** rule when source status is stale, absent, downgraded, or the source is unreachable — "show last known" is the wrong default for money.
- No **overlay precedence**: a freeze / quarantine / restatement / reversal signal must *always win* over a cached positive status, regardless of cache freshness.

This is the gap that turns "we don't own truth" from a slogan into a control.

### C2 — Read-path (object-level) authorization is unmodelled: classic IDOR/BOLA and confused-deputy over the platform's entire data surface

**Area:** 5.3 Permission and Context Enforcement · 05 §2.1 `portal_session_context` · 07 Permission Rules · all `GET` routes in 04.

Action-path permissions are enforced hard (IAM-02, SoD, maker-checker, step-up). But a portal is ~80% **reads**, and the read path has no **object-level / row-level authorization** model:
- Nothing prevents client A from reading client B's balances / status / documents / history by substituting an identifier (BOLA/IDOR — the #1 real-world portal breach class and a direct client-money-confidentiality + data-protection failure).
- Staff worklists (WF-PRT01-05) are described as filtered "by role", not **scoped to assigned cases / mandate** — a permissioned staff user must not be able to enumerate all clients.
- The **Portal Service Account** (06 Actors) holds broad backend access to LED/DEP/WDR/etc. Nothing states the source call is **re-scoped to the end-user's own entitlement** rather than the service account's — the confused-deputy problem. `portal_session_context.role_snapshot_hash` captures the role but no **data-scope / ownership** binding.

The pack needs an explicit ownership/entitlement check on every object read and a rule that the portal never exercises more authority than the authenticated end user holds.

### C3 — Freeze / revocation / restatement reaches the portal by *polling only*: invalidation is racy and best-effort, contradicting INC-01's verified-effective freeze

**Area:** 5.9 Incident/Freeze-Aware UX · 04 §2.12 `GET /prt1/incidents/context` · 05 §2.1 `active_incident_context_hash`.

INC-01 was accepted specifically because it made freeze *verified-effective* (the gate actively denies, not merely acknowledged). The portal, as the surface those frozen actions are attempted from, currently learns about freeze/incident context by **pull** (`GET .../incidents/context`) and holds a **snapshot** hash on the session. There is no **push / subscription / invalidation-epoch** so that when INC freezes, AML revokes an approval, WLT de-whitelists a destination, or REC restates a report, in-flight sessions and caches are **immediately invalidated and forced to revalidate**.

Consequence: backend denial still protects the *money* (good — the source rejects), but the *displayed affordances and statuses* lag arbitrarily until cache expiry or a user refresh — producing contradictory UX, repeated blocked attempts (noise, and a tipping-off/again-attempt signal), and a management dashboard that is green while a freeze is active. The portal should bind to a **revocation/invalidation epoch + subscription**, and treat **loss of subscription or epoch staleness as fail-closed** (assume possibly-stale → force revalidation before any sensitive display or action).

### C4 — The export/evidence path is the platform's highest-consequence data egress and is the thinnest-specified

**Area:** 5.10 Evidence/Export Controls · 04 §2.11 `POST /prt1/exports` · 05 §2.5 `export_request` · WF-PRT01-06.

Export has `approval_ref` + `masking_policy_ref` + audit — but the exact REC/SEC/INC contract is not bound:
- No requirement that **masking is applied at the source / policy engine, not by the portal** — the portal must never receive unmasked data and mask it client-side (a masked-in-the-browser export leaks the raw payload).
- No **recipient / purpose / lawful-basis capture** for auditor/regulator packs, and no **disclosure log** — data-protection and regulated-disclosure need who/why/what-basis, not just "approved".
- No **recipient-bound, single-use, expiring download token + watermark**: an "approved" export can currently be re-downloaded, forwarded, or its link replayed. `export_request.status` reaches `downloaded` with no re-download ceiling.
- No **re-check at generation and download time** that the requester still holds permission and that no freeze / legal-hold / tipping-off conflict has arisen *since approval* — approval can predate an incident.

### C5 — The browser is not modelled as a hostile-input / integrity boundary: economics and uploads are trusted more than "backend revalidates permission" covers

**Area:** 5.11 UI/API Consistency · WF-PRT01-02/03/04 · In-Scope #8 (document/evidence).

"Backend revalidates" is stated for **permission/context**, but the portal fronts *money*, and the client is the one untrusted actor with motive to tamper. Missing hostile-input controls:
- **Economics anti-tamper.** Quote acceptance (WF-PRT01-04, `POST /prt1/client/quote-acceptance`) must bind to the **server-issued quote (ID/hash + validity)**, and the client must not be able to post a different price / fee / amount / destination than the server issued. Nothing states the accepted economics are the server's, not the browser's — a direct disclosed-fee-integrity risk given the agency/disclosed-fee-only licence model.
- **Upload safety.** In-Scope #8 covers document/evidence handling, but there are **no upload-side controls** (allowed types/size, malware scan, CSV/formula-injection, SSRF/parser abuse) — KYC document upload is a classic ingress vector.
- **Standard web-integrity defenses** for state-changing routes: CSRF, clickjacking, session-fixation, output-encoding/anti-injection, and integrity of the rendered client-safe message (a tampered or mis-rendered message is itself a tipping-off / mis-communication risk).

"The browser is untrusted" needs to be a first-class principle alongside "the portal is not source of truth."

---

## 2. Recommended Corrections

1. **Notification supersession + reconcile-before-send.** Notifications can arrive duplicated or out of order ("paid" then a later "reversed"). Add per-notification **versioning/supersession** and a rule that a client notification is reconciled against **current source truth at send time** (so a stale contradictory notice is suppressed/superseded), while preserving the 5.12 rule that opt-out cannot disable mandatory regulatory/security notices.

2. **Bind step-up to the specific action, not just recency.** `last_step_up_at_utc` proves *when*, not *what for*. Define an action-risk-tier → required step-up-freshness map, and for high-value payout authorisation bind the step-up to **action + amount + destination** (dynamic-linking / transaction-signing semantics), so a stale or unrelated MFA cannot authorise a new money movement.

3. **Disclosed-fee display truthfulness as an explicit requirement.** The trade/quote screen is the platform's actual **disclosure surface** for the agency + disclosed-brokerage-only model. Require that the fee/commission shown equals what TRD/LED will charge, itemised, with no markup surfaced as "spread", and that the accepted economics are the disclosed ones (reinforces C5 with a regulatory-disclosure obligation).

4. **Structurally separate the client-safe channel from internal reason codes.** 5.5 asserts staff "distinguishes internal reason from client-safe message", but nothing *structurally* prevents free-text or an internal reason-code field from reaching the client channel. Require the client-facing channel to render **only** approved templates keyed to a **client-safe reason-code catalogue**, with internal reasons held in a separate field/store the client channel cannot read — no free-text to client.

5. **Correlation-ID propagation into every source call and audit event.** The FND-01 correlation ID is the platform's cross-module spine and E2E/REC/SEC's reconstruction key. The portal *originates* most user actions and must **stamp and propagate** a correlation ID into every source request and SEC event; `portal_action_request` should carry it (today it holds only `source_request_ref`). Without this the user-action → money-movement chain is not reconstructable and PRT-01 sits outside the E2E denominator (see Consistency Note).

6. **"Source unavailable ≠ all-clear" degraded-display rule.** When a source is down or in INC degraded-mode (§5.17), the portal must render an explicit **"status unavailable — cannot confirm"** state, must **not** default to blank / zero / stale-positive, and must disable affordances requiring a confirmable status. Generalise TC-031 (dashboard must not hide a safeguarding deficit) into a platform-wide rule: a missing feed is never shown as green.

---

## 3. Additional Parameters to Define

```txt
# Display-truth / cache
display_cache_ttl_by_status_class          # money-critical vs informational (money-critical: seconds, not minutes)
source_status_staleness_threshold          # age beyond which display fails-closed to less-favourable
source_status_version_scheme               # monotonic per-object sequence used for non-regression check
non_regression_enforcement                 # never render status more favourable/advanced than current source
overlay_precedence_order                   # freeze/quarantine/restatement/reversal always override cached positive

# Authorization (read path)
object_ownership_model_per_resource        # who owns/what scopes each readable object
staff_worklist_scope                       # assigned-case / mandate scoping, not role-wide enumeration
service_account_reauthorization_rule       # source call re-scoped to end-user entitlement (no confused deputy)

# Invalidation / freeze reach
invalidation_epoch_subscription            # push channel for freeze/revocation/restatement
max_acceptable_invalidation_lag            # beyond this, fail-closed / force revalidate
subscription_loss_behaviour                # assume possibly-stale -> revalidate before sensitive display/action

# Export / evidence
export_masking_locus                       # source/policy-engine (NEVER portal-side masking)
export_download_token_ttl                  # single-use, recipient-bound, expiring
export_max_redownload_count                # ceiling (default 1)
export_watermark_policy                    # regulator/auditor packs
export_recipient_purpose_basis_capture     # disclosure log fields (who / why / lawful basis)
export_recheck_at_generation_and_download  # permission + freeze/legal-hold/tipping-off re-check post-approval

# Session / step-up
session_idle_timeout / session_absolute_timeout
step_up_freshness_by_action_risk_tier
high_value_step_up_binding                 # action + amount + destination (dynamic linking)

# Hostile-input boundary
quote_acceptance_binding                   # server quote ID/hash + validity; reject client-posted economics
file_upload_policy                         # allowed types/size, malware scan, CSV-injection, SSRF
web_integrity_controls                     # CSRF / clickjacking / session-fixation / output-encoding

# Communication
client_safe_reason_code_catalogue
template_approval_authority                # Compliance/MLRO/Security/Management per template_type
notification_supersession_rule

# Traceability
correlation_id_propagation                 # into every source call + SEC event; stored on portal_action_request
```

---

## 4. Consistency Note

- **Version pinning.** The dependency list (01 §1) cites **all** upstreams at **v1.2**, including E2E-01/DEP-01/WDR-01/REC-01 (accepted at **v1.1**; their v1.2 are clean cosmetic rollups) and CLT/KYC/AML/WLT/LED which are substantively accepted at **v1.1** (TRD-01 is genuinely at v1.2). Pin to accepted versions or mark forward references. Unlike the prior packs, the **`01 §1` version cell is correct here** (it reads v1.0 for a v1.0 pack) — no version-cell nit this time.
- **PRT-01 is not yet inside the E2E-01 reconciliation denominator.** E2E-01 built the correlation registry as the authoritative reconciliation set; portal-originated actions must appear in it (see Correction 5). Recommend E2E-01 be extended so that every sensitive portal action reconciles to a source request and a SEC event — otherwise the user-facing surface is the one place the platform's end-to-end coverage proof has a blind spot.
- **13 Reconciliation Design** already lists the right portal-reconciliation checks (displayed-final matches source-final, export has approval+audit, no source-truth financial data exists). Those checks are the natural home for the C1 non-regression and C4 export-integrity assertions — they should be strengthened from "matches" to "never more favourable than, and fails closed on absence."

---

## 5. Top Priorities

1. **C1 — Non-regression / fail-closed display-truth model** (version-bound status, overlay precedence, never-more-favourable, fail-closed on stale/absent). This is the portal's entire reason to exist and its biggest client-harm vector.
2. **C2 — Object-level (read-path) authorization** — IDOR/BOLA + service-account re-scoping. The classic portal breach; direct confidentiality and data-protection exposure.
3. **C3 — Push invalidation for freeze/revocation/restatement** so the portal is a genuinely frozen surface, consistent with INC-01's verified-effective freeze — not a polling lag.
4. **C4 — Export path hardening** (source-side masking, single-use recipient-bound tokens, disclosure log, post-approval re-check) — the highest-consequence egress.

C5 and the six corrections are the hardening layer; none is a feature gap, all are the "the browser is untrusted / the display can lie" mechanisms that turn PRT-01's already-correct principles into enforceable controls.

**Programme context:** with the control-plane, compliance, money-tier, integration, execution-rail, reconciliation and resilience modules all accepted, PRT-01 is the final module — the presentation layer over a fully-specified money and control surface. It is the least control-critical of the set precisely because everything behind it already fails closed; these gaps ensure the portal does not *reintroduce* risk at the one boundary the end user touches. Recommend the author address C1–C5 in a v1.1 for final verification in the established format.
