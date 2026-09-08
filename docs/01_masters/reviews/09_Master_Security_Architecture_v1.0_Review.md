# Principal Fintech Platform Architect Review

## Document Reviewed: 09_Master_Security_Architecture_v1.0.md

| Item | Details |
|---|---|
| Reviewed document | 09_Master_Security_Architecture_v1.0.md |
| Platform | AIX Money Broking + PSO Platform |
| Review type | Principal Fintech Platform Architect / Regulated Fintech Security Review |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 03 v1.2, 02 v1.2, 04 v1.2, 05 v1.2, 06 v1.2, 07 v1.2, 08 v1.2 (see consistency note) |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | Strong, comprehensive security architecture; five gaps (threat model, transaction limits/thresholds, field-level encryption, immutable backups, staff impersonation) to close, plus version/rule-mapping reconciliation, before the Master Testing Strategy (doc 10) |

---

## 0. Summary

This is a strong, comprehensive security architecture. It inherits and carries forward the doc-08 controls well — audit-write atomicity (§15.2), per-client isolation (§7), inbound webhook verification (§11), durable idempotency, and the exchange-lock exclusion (§13/§21) — and adds solid identity/authentication (§5), authorization/SoD/maker-checker (§6), network zoning (§8), API/application security (§9), encryption/KMS/secrets (§10), ledger/money/client-money security (§12), AML/STR/Travel Rule/privacy (§14/§16), audit/logging/monitoring (§15), backup/DR/incident/break-glass (§18/§19), CI/CD (§20), a security go-live gate (§23), and a security-to-rule mapping (§27).

This review focuses on genuine security-control gaps rather than restating what is already covered.

---

## 1. Critical Gaps

### C1. No threat model in the security architecture (Areas 1, 12) — HIGHEST PRIORITY

§23.2 makes "Threat model completed" a **go-live gate** and §28 requires a threat model per high-risk module — but the master security document itself contains **no threat model**: no asset inventory, no threat-actor list, no trust-boundary enumeration, no top-threats→mitigations mapping (STRIDE or equivalent). The go-live gate references a parent artifact that does not exist here. A security architecture should anchor on a threat model so control completeness can actually be *derived* rather than asserted. This is the backbone artifact and it is missing.

### C2. No transaction velocity / value limits or staff approval thresholds (Areas 3, 7, 13)

Account-takeover and fraud are listed as incident categories (§18.2.3), but the **preventive money-security controls are absent**: no per-client withdrawal **velocity caps**, no daily/per-transaction **value limits**, no **anomaly-based holds**, and no **value-tiered approval** (withdrawals above a threshold requiring senior/dual staff approval). Maker-checker (§6.4) and cooling-off (§12.3) are binary and destination-based — they do not bound *how much* or *how fast* value can leave through an already-approved path. A compromised approver, or a rapid drain within existing controls, is currently unbounded. This is the core anti-fraud money layer and it is not specified.

### C3. Storage-level encryption only — no field/application-level encryption for the most sensitive data (Area 6)

§10.2 encrypts stores at rest, but the platform's own 7-tier classification (§16.1) implies differentiated protection that is not delivered: **Security-Critical / Highly-Restricted fields** (MFA secrets, bank/wallet identifiers, document/ID numbers, STR content) sit as **plaintext inside an encrypted database**. Storage-at-rest encryption only protects against physical/disk theft; a DB-level compromise (SQLi, insider read, leaked backup, misconfigured replica) exposes all of it. Field-level / envelope encryption (or tokenisation) for the top classifications is a standard regulated control and is missing.

### C4. No ransomware-resilient / immutable / air-gapped backup (Area 10)

Backups are encrypted and access-controlled (§19.1) but **mutable** — an attacker or ransomware that reaches the environment can encrypt or delete them. There is no **WORM/immutable retention**, no **offline/air-gapped copy**, and **ransomware is not in the incident categories** (§18.2). For a platform holding client money and an immutable ledger, the recovery-of-last-resort must survive an adversary who also reaches the backup store. This is a serious resilience gap because backups are the ultimate control behind safeguarding and ledger integrity.

### C5. No staff impersonation / privileged support-view control (Areas 3, 13)

A Support role exists and can view client data, and account-takeover is a named incident — but there is **no control governing "act-as-client" / support-view / impersonation**: no requirement that it be explicit, **read-only** (no transaction execution as the client), consented/justified, time-boxed, and **heightened-audited**. Impersonation is one of the most abused privileged paths in fintech operations; §7.3 covers staff *read* logging but not the impersonation/session-assumption vector specifically. Without an explicit control, a support account becomes an unbounded cross-client action path.

---

## 2. Recommended Corrections

1. **Add a Threat Model section (C1):** assets (client money, ledger, KYC/STR data, keys, LP/custodian credentials), threat actors (external attacker, malicious insider, compromised vendor, compromised client), trust boundaries (from the §4 diagram), and a top-threats→mitigations table. Make the §23.2 go-live gate point at it.

2. **Add Transaction Limits & Approval Thresholds (C2):** per-client and per-destination **velocity/value limits**, daily caps, anomaly-triggered holds, and **value-tiered staff approval** (senior/dual approval above thresholds) — tied into the Transaction Monitoring engine from doc 08. Add "limit breach" and "velocity anomaly" to monitoring (§15.4).

3. **Add field/application-level encryption (C3):** require envelope/field-level encryption or tokenisation for Security-Critical and Highly-Restricted fields (MFA secrets, bank/wallet identifiers, document/ID numbers, STR content), with keys in KMS and access audited — layered on top of storage-at-rest.

4. **Add immutable/air-gapped backups + ransomware (C4):** WORM/immutable backup retention, an offline or logically-isolated copy, restore-integrity verification, and a **ransomware incident category and playbook** in §18.2. Add "ransomware recovery / immutable-backup restore" to the security tests (§22) and go-live gate (§23).

5. **Add an Impersonation / Support-View control (C5):** explicit, justified, time-boxed, **read-only by default** (no transaction execution as client), with heightened audit and client-visibility/notification where required. Add an impersonation-abuse security test.

6. **Strengthen authentication (§5):** (a) **phishing-resistant MFA (FIDO2/WebAuthn)** for Admin/Super Admin/Security/Tech rather than SMS/TOTP alone; (b) an explicit **account-lockout / progressive-delay** policy and unlock workflow (rate limiting ≠ lockout), with DoS-via-lockout considered; (c) **new-device / new-location login notification** and step-up, given ATO is an incident category.

7. **Add software supply-chain controls to §20:** require **SBOM**, **signed build artifacts + provenance/attestation**, and pinned/locked dependencies — not just dependency scanning and "commit signing recommended." Supply-chain compromise is a major vector and is currently only partially covered.

8. **Add meta-audit and audit-access review:** reading/exporting the audit log (including Auditor access) must itself be audited, and audit/privileged access included in the §24.1 access review. Prevents silent audit-trail reconnaissance.

9. **Specify internal service-to-service auth:** mutual TLS / workload identity for internal service communication (§8 currently only "encrypted where supported") — important as doc 08's §3.2 service extraction proceeds.

10. **Add certificate pinning for critical financial-vendor egress** (LP, custodian, bank) to §10.1/§11, reducing MITM/rogue-endpoint risk on money-movement calls.

---

## 3. Consistency / Conflicts with 00–08

- **Version cite is wrong:** base document 9 is listed as `08_Master_Technical_Architecture_v1.2.md` (and the §30 review prompt repeats it), but the current doc 08 is **v1.1** — there is no v1.2. This is the recurring version-labeling defect; correct the citation to v1.1 (or confirm a v1.2 was produced).
- **§27 rule-ID reconciliation:** §27 introduces IDs not used in doc 08's §26 mapping — `LIC-RULE-001..004`, `ASSET-RULE-001`, `CMP-RULE-001`, `PRIV-RULE-001`, `IAM-RULE-002` — while dropping the `CFG-RULE` (feature-flag) mapping doc 08 used and relabeling privacy from `DATA-RULE` to `PRIV-RULE`. Verify each resolves against the **actual doc 06 v1.2 rule catalogue** so the security-to-rule traceability isn't pointing at non-existent IDs (same class of issue as the earlier AML-RULE-001A→006 rename).
- **§29.1 leftover:** "Planning Model / **ChatGPT 5.5**" carries the same template artifact flagged in doc 08 §33.1 — cosmetic.

---

## 4. Additional Security Requirements / Parameters to Add

```txt
# --- New sections ---
Threat Model (assets, actors, trust boundaries, top-threats -> mitigations)
Transaction Limits & Approval Thresholds (velocity, value caps, anomaly holds, tiered approval)
Field-Level / Application-Level Encryption for Security-Critical + Highly-Restricted data
Immutable / Air-Gapped Backup + Ransomware playbook
Staff Impersonation / Support-View Control

# --- Parameters ---
threat_model = required_before_go_live
withdrawal_velocity_limits = required
transaction_value_limits = required
value_tiered_staff_approval = required
anomaly_based_hold = required
field_level_encryption_sensitive = required
tokenisation_where_applicable = recommended
immutable_backup = required
air_gapped_or_isolated_backup_copy = required
ransomware_incident_playbook = required
staff_impersonation = explicit_readonly_timeboxed_heightened_audit
phishing_resistant_mfa_admin = required
account_lockout_policy = required
new_device_login_notification = required
sbom_required = true
signed_build_artifacts = required
dependency_pinning = required
audit_read_export_meta_audited = true
internal_service_mtls = required_where_extracted
vendor_egress_cert_pinning = required_for_money_vendors
```

---

## 5. Top Priorities Before the Master Testing Strategy (doc 10)

1. **C1** — Threat model. The security doc's missing backbone, and a go-live gate that currently references nothing.
2. **C2** — Velocity/value limits + approval thresholds. The anti-fraud money layer that maker-checker and cooling-off do not provide.
3. **C4** — Immutable/air-gapped backups. Ransomware resilience for a client-money + immutable-ledger platform.

C3 (field-level encryption) and C5 (impersonation control) should ride along. Also fix the doc-08 version citation and reconcile the §27 rule IDs, so doc 10's test traceability builds on accurate references.

---

## 6. Consistency Note

The exchange-lock (§13/§21), client-money (§12.5), tipping-off (§14.2), and audit-write atomicity (§15.2) controls are tight and consistent with the upstream chain. The gaps are **preventive controls and resilience patterns not yet present** (threat model, transaction limits, field-level encryption, immutable backups, impersonation control), plus a version/rule-mapping reconciliation — not contradictions of the regulated design.
