# Principal Fintech Platform Architect Review

## Document Reviewed: 07_Master_Data_Flow_v1.0.md

| Item | Details |
|---|---|
| Reviewed document | 07_Master_Data_Flow_v1.0.md |
| Platform | AIX Money Broking Platform |
| Review type | Principal Fintech Platform Architect / Regulated Fintech Data & Security Review |
| Base documents (as cited) | 00 v1.3, 01 v1.3, 03 v1.2, 02 v1.2, 04 v1.2, 05 v1.2, 06 v1.2 |
| Review basis | Labuan FSA Money Broking + PSO scope, Exchange application pending |
| Verdict | Strong, comprehensive data-flow map; five gaps (auth flow, rule mapping, backup/DR, STR-to-FIU, store inventory) to close before Master Technical Architecture |

---

## 0. Summary

This is a strong, comprehensive data-flow map — 22 flows (DF-01–22), a 7-tier data classification model, systems / vendor inventories, a master mermaid diagram, data domains, retention, residency, per-flow security-control requirements, and testing. The future-locked-exchange block and money-movement flows are well-mapped. Version chain is consistent (all cited v1.2 bases exist).

This review focuses on genuine data-flow gaps.

---

## 1. Critical Gaps

### C1. No Authentication / Session / MFA data flow (Areas 1, 4) — HIGHEST PRIORITY

The Auth Service is in the systems inventory and handles the platform's most security-sensitive data — credentials, session tokens, MFA secrets, password-reset tokens, OTP delivery — classified **Security Critical** in §4. Yet there is **no DF mapping it**. The credential / session / MFA / OTP flows (including OTP handoff to the notification vendor) are unmapped, so their encryption, token handling, replay protection, and vendor-PII controls have no home. This is the single biggest missing flow.

### C2. No data-flow-to-rule mapping / traceability matrix (Area 11)

Doc 06 established a rule-to-module map; the document's own review prompt (§37.11) asks for "data-flow-to-rule mapping." But doc 07 stops at per-flow security controls and error codes — there is **no matrix tying each DF (01–22) to the system rules it enforces** (SYS / LIC / AML / PAY / LP / LED / SET / SAFE…). Without it the traceability chain (rule → workflow → data flow) is broken, and the RPT-13 traceability matrix cannot be completed from this layer.

### C3. No backup / DR data flow — backup residency and encryption unaddressed (Areas 5, 10)

REL-RULE-001 (doc 06) mandates backup / restore, but doc 07 never maps **where backups of Restricted / Highly-Restricted / Financial-Critical data go, how they're encrypted, or their data residency**. §32 covers cross-border *vendor* processing but not backups. A backup of KYC / STR / ledger data replicated across a border or stored unencrypted is a classic, high-severity breach vector — and it is currently invisible in the data-flow map.

### C4. STR filing to FIU / regulator is not mapped as its own controlled flow (Areas 6, 9)

DF-15 covers AML case → freeze internally, and DF-20 covers regulatory reporting generically, but the **STR-to-FIU submission** — the most confidential outbound regulated flow — has no dedicated data flow. It needs explicit controls: restricted channel, encryption, tipping-off protection (the client / most staff must never see it), evidence retention, and highly-restricted access. Folding it into generic reporting under-controls it.

### C5. Store inventory is incomplete — flows reference stores that aren't enumerated (Areas 2, 11)

Numerous stores appear in the DF tables but are absent from §5.1 systems and §7 domains: **Consent Store, Payout Destination Store, Suspense / Clearing Account, Safeguarding Store, Alert Store, FX Policy Store, Precision Policy Store, Export Store, Regulator Submission Evidence Store, Archive Store, Data Inventory.** Each is a real data store that needs a classification and owner. The inventory should be complete, or these stores fall outside the classification / retention / residency controls the doc otherwise enforces.

---

## 2. Recommended Corrections

1. **Add `DF-23 Authentication / Session / MFA` (C1):** login → token issuance, session lifecycle, MFA enrolment / reset, password reset, and OTP delivery to the notification vendor — with Security-Critical controls (encryption, hashing, short-lived tokens, replay / rate-limit, no credential / OTP in logs or vendor payloads beyond what's needed).

2. **Add a Data-Flow-to-Rule Mapping matrix (C2):** one row per DF-01–23 mapping to the enforcing rules (e.g., DF-08 Withdrawal → PAY-RULE-001 / 002 / 003, LED-RULE-002 / 003, SET-RULE-001, SOD-RULE-001). This completes the rule → workflow → data-flow traceability and feeds RPT-13.

3. **Add `DF-24 Backup, Replication & DR` (C3):** map backup / replica destinations, encryption-at-rest of backups, key management, backup data residency, restore-test data path, and access controls — explicitly extending §32 residency to backups.

4. **Add `DF-25 STR Filing to FIU / Regulator` (C4):** dedicated highly-restricted flow with encrypted channel, tipping-off protection, restricted-role access, submission-evidence store, and retention — separate from routine reporting.

5. **Complete the store inventory (C5):** add every store referenced in the DF tables to §5.1 / §7 with a classification and owner (Consent, Payout Destination, Suspense / Clearing, Safeguarding, Alert, FX Policy, Precision Policy, Export, Regulator Evidence, Archive, Data Inventory).

6. **Add a log / telemetry data flow with PII scrubbing.** §3.5 prohibits PII in public logs, but there's no flow showing application / security-log data movement, masking / scrubbing, retention, and residency — logs are a common PII-leak path and deserve a mapped control.

7. **Add a dedicated Notification / OTP flow (or fold into DF-23).** Contact PII and OTPs flow to the notification vendor; map data minimisation, vendor approval, and residency for that path explicitly rather than only as a terminal step in other flows.

8. **List the on-chain node / data provider separately in §5.2** (currently implicit under "Custodian / Node Provider"), and add an FX-rate lineage note showing the approved rate flowing quote → trade → ledger → report for auditability.

---

## 3. Additional Data Flows / Parameters to Add

```txt
# --- New data flows ---
DF-23  Authentication / Session / MFA / OTP            # Security Critical
DF-24  Backup, Replication & DR                        # encryption + residency of backups
DF-25  STR Filing to FIU / Regulator                   # highly restricted, tipping-off protected
DF-26  Application / Security Log & PII Scrubbing       # log masking, retention, residency
(optional) DF-27  Notification / OTP Delivery           # contact PII to vendor, minimised

# --- New sections ---
Data-Flow-to-Rule Mapping matrix (DF-01..DF-23 -> SYS/LIC/AML/PAY/LP/LED/SET/SAFE rules)
Complete Store Inventory (add Consent, Payout Destination, Suspense/Clearing, Safeguarding,
  Alert, FX Policy, Precision Policy, Export, Regulator Evidence, Archive, Data Inventory)

# --- Parameters ---
auth_session_mfa_flow_mapped = required
str_filing_flow = confidential_tipping_off_protected
backup_data_flow = encrypted_and_residency_controlled
data_flow_to_rule_mapping = required
store_inventory_complete = required
log_pii_scrubbing = required
notification_vendor_pii = minimised
onchain_node_provider_listed = true
fx_rate_lineage_traceable = quote_trade_ledger_report
```

---

## 4. Top Priorities Before the Master Technical Architecture

1. **C1** — The auth / session / MFA flow. The most security-sensitive data and it is unmapped.
2. **C3** — Backup / DR residency + encryption. The invisible breach vector.
3. **C2** — Data-flow-to-rule mapping. Needed to keep the whole 00→07 traceability chain intact before architecture locks components in.

C4 (STR-to-FIU) and C5 (store inventory) should ride along since both are quick, well-scoped additions.

---

## 5. Consistency Note

The map is otherwise well-aligned with docs 00–06, and the exchange-lock / agency / money-movement flows are tight. The gaps are all **flows and stores that exist implicitly but were never explicitly mapped**, rather than design contradictions.
