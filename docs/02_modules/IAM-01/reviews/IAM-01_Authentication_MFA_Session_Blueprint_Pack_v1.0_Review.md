# Principal Fintech Platform Architect Review

## Document Reviewed: IAM-01_Authentication_MFA_Session_Blueprint_Pack_v1.0

| Item | Details |
|---|---|
| Reviewed pack | IAM-01 Authentication / MFA / Session Blueprint Pack v1.0 (16 blueprint files + README) |
| Platform | AIX Money Broking + PSO Platform |
| Review type | Principal Fintech Platform Architect / Regulated Fintech Module Blueprint Review |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 02–11 v1.2, FND-01 (dependency version defect — see below) |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | Strong, security-mature module; five gaps (step-up interface, MFA-reset sequencing, freeze→revocation, session policy, session-hijack mitigation) to close before acceptance |

---

## 0. Summary

This is a strong, security-mature module that faithfully inherits the FND-01 template — rule-ID/workflow/data-flow traceability (15), audit/outbox atomicity with a fail-closed test (IAM1-TC-049), per-module DB isolation tests (053/054), correlation IDs, and field-level MFA-secret encryption. It correctly picks up the doc-09 auth controls: phishing-resistant privileged MFA (IAM1-TC-023/024), account lockout with DoS-awareness (037/038), refresh-token reuse detection with family revocation (032), new-device notification (039/040), session revocation on password/MFA/role change (033/034/035), and no-secret logging (008/016/027/036). The reconciliation design (session/token/MFA-compliance jobs) and the state machines are genuinely well done.

This review focuses on real gaps — missing auth capabilities and integration contracts, not contradictions of the regulated design.

---

## 1. Critical Gaps

### C1. Step-up authentication for sensitive actions is not defined as a reusable interface (Areas 3, 6) — HIGHEST PRIORITY

IAM-01 does MFA only at **login** (WF-IAM01-03). But doc 09 §5.4.7/§6.5 require **step-up re-authentication for sensitive actions**, and downstream money modules depend on it — withdrawal approval, payout-destination change, high-value trades, and IAM-01's own MFA reset all need "prove it's still you, right now." There is no `/auth/step-up` endpoint, no reusable "recent-auth / step-up assertion" that other modules can require, and no `step_up` challenge flow wired to business actions (only `challenge_type: step_up` exists as an enum with no flow). Like FND-01's scheduler, this is a **foundation capability the whole platform's sensitive-action security rests on** — if it is not built here, every money module has to reinvent it (or skip it).

### C2. MFA-reset maker-checker depends on IAM-02, which does not exist yet at IAM-01 go-live (Areas 4, 11)

IAM-01 **blocks** IAM-02 (it is built first), yet routes its highest-risk action — admin-forced MFA reset (WF-IAM01-07 step 3, §5.4.5) — through "IAM-02 maker-checker where applicable." At IAM-01 go-live the approval engine does not exist, so an admin MFA reset could occur **with no enforced approval**. The "or equivalent approval workflow" escape hatch is undefined. This is a genuine sequencing hole: either specify an **interim maker-checker** control inside IAM-01, or **hard-disable admin/staff-initiated MFA reset until IAM-02 is live** (self-service reset with re-verification can remain).

### C3. Account freeze/suspension → immediate session revocation contract is unspecified (Areas 4, 11)

An AML/compliance **freeze must instantly kill a user's live sessions** — but IAM-01 only says revocation happens "where downstream status is known" (§5.3.8) and "where applicable" (WF-IAM01-06). It never defines *how* the freeze event reaches IAM-01 (event subscription vs. status check) or guarantees **mid-session** revocation. As written, a frozen client with an active access token could keep transacting until token expiry. Given freeze is a hard regulatory control, IAM-01 needs an explicit freeze→revoke integration (event-driven revocation + a status re-check on token refresh) and a test for it.

### C4. No differentiated session policy by user class, and no privileged re-authentication (Area 5)

Doc 09 §5.4.6 requires **shorter admin session timeouts**, but IAM-01 has a single generic session model ("short-lived or revocable") with the timeout deferred as one global open item. Admin/Super Admin/Security sessions should have tighter TTL and periodic forced re-auth; client sessions can be longer. Without differentiated policy, either admins are over-exposed or clients are over-friction'd. The session model should carry a per-user-class policy (TTL, idle timeout, re-auth interval, step-up triggers).

### C5. Session-hijacking / access-token theft is not mitigated (Areas 5, 6)

Refresh-token **reuse** is well handled (family revocation), but a stolen **access token** replayed from a different device/IP is not detected — even though the session table already stores `device_id`, `source_ip_hash`, and `user_agent_hash`. There is no token-binding rule and no **mid-session anomaly check** (IP/UA/device change → step-up or revoke). Session hijacking is a primary account-takeover vector on a money platform; the stored metadata should be *used* to detect it, not just recorded.

---

## 2. Recommended Corrections

1. **Define a step-up interface (C1):** add `/auth/step-up` (challenge + verify) and a reusable "recent-auth assertion" (auth freshness timestamp + level) that downstream modules can require for sensitive actions; wire the existing `step_up` challenge type to it, and require it for MFA reset, withdrawal approval, and payout-destination changes.

2. **Add an interim MFA-reset control (C2):** specify an IAM-01-internal maker-checker (or dual-Security-Admin approval) for admin-initiated MFA reset, OR hard-gate admin MFA reset off until IAM-02 is live. Add a test that admin MFA reset without approval is blocked at IAM-01 go-live.

3. **Define the freeze→revocation contract (C3):** event-driven session revocation on account freeze/suspension + a status re-check on every token refresh; add tests for "frozen user's active session is revoked mid-session" and "refresh denied for frozen user."

4. **Add per-user-class session policy (C4):** distinct TTL / idle timeout / re-auth interval for admin vs staff vs client; store the policy on the session and test that admin sessions expire sooner and require periodic re-auth.

5. **Add access-token binding / mid-session anomaly detection (C5):** bind tokens to session+device; on IP/UA/device change beyond tolerance, force step-up or revoke; add a session-hijack test.

6. **Fix the FND-01 dependency reference.** `01` cites "Depends on FND-01 … **v1.2**" and base doc "`FND-01_..._v1.2.zip`" — FND-01 is at **v1.1** and is a directory, not a zip. Correct to v1.1 (the accepted version).

7. **Clarify `iam.auth_event` vs the SEC-01 audit store (05 §2.11).** As an "optional read model … if not fully stored in audit module," it risks a second source of truth. State that the central audit store (SEC-01) is authoritative and `iam.auth_event` is a non-authoritative local index only.

8. **Strengthen password policy.** Beyond hashing, specify length/complexity, password-history reuse block, and a breached-password (HIBP-style) check — currently only "password policy enforced."

9. **Add concurrent-session controls.** A max-concurrent-session policy (especially privileged) and a user-initiated "log out all sessions."

10. **Add the missing tests:** freeze→revocation, step-up challenge, concurrent-session limit, and rate-limiting on **MFA-verify and token-refresh** (FR-016 lists them but only login/reset are tested).

---

## 3. Consistency Note

- **Dependency-version defect:** the "FND-01 v1.2.zip" citation is wrong (should be v1.1 directory) — the one real traceability slip; everything else cites 00 v1.3 / 01 v1.3 / 02–11 v1.2 correctly.
- **Rule-ID mapping (15) resolves** against doc 06 v1.2 (IAM-RULE-001, SEC-RULE-001/002/003, SYS-RULE-001/005, DATA-RULE-001/002, VND-RULE-003, GOV-RULE-001) and the traceability tables are complete (rule/workflow/data-flow → tests), matching the FND-01 template.
- **Auth-is-not-authorization boundary is clean** (§5.1) and prohibited-permissions/behaviours correctly bar permission grants, exchange access, and secret viewing. The gaps are **missing auth capabilities and integration contracts**, not contradictions of the regulated design.

---

## 4. Additional Requirements / Parameters to Add

```txt
# --- New capabilities / sections ---
Step-Up Authentication interface (recent-auth assertion for sensitive actions)
Interim MFA-reset approval control (until IAM-02 live)
Account freeze/suspension -> immediate session revocation contract
Per-user-class session policy (admin/staff/client TTL + re-auth)
Access-token binding + mid-session anomaly detection
Concurrent-session limit + global logout
Breached-password / password-history check

# --- Parameters ---
step_up_auth_interface = required
step_up_required_for_sensitive_actions = true
mfa_reset_interim_approval = required_until_iam02
admin_mfa_reset_without_approval = prohibited
freeze_triggers_session_revocation = required
frozen_user_refresh = denied
session_ttl_by_user_class = required
admin_session_shorter_ttl = required
access_token_bound_to_session_device = required
mid_session_anomaly_step_up_or_revoke = required
max_concurrent_sessions = defined_by_user_class
global_logout = supported
breached_password_check = required
password_history_reuse = blocked
fnd01_dependency_version = v1_1_corrected
auth_event_authoritative_store = sec01_audit
```

---

## 5. Top Priorities Before IAM-01 Acceptance

1. **C1** — Step-up interface. The platform-wide sensitive-action capability every money module will need.
2. **C2** — MFA-reset sequencing. Its highest-risk action currently routes to a not-yet-built approver.
3. **C3** — Freeze→session revocation. A hard AML control currently left as "where applicable."

C4 (differentiated session policy) and C5 (session-hijack mitigation) should ride along as core session-security hardening.
