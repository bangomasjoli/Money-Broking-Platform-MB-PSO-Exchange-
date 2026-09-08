# WLT-01 Wallet Screening / Payout Destination Whitelist
## 01 Module Blueprint

## 1. Document Control

| Item | Details |
|---|---|
| Module code | WLT-01 |
| Module name | Wallet Screening / Payout Destination Whitelist |
| Pack version | v1.0 |
| Status | Initial module blueprint for Claude Opus review |
| Platform | AIX Money Broking + PSO Platform |
| Licence posture | Money Broking and PSO approved; Exchange pending |
| Module category | Money Tier / Destination Control / AML-CFT Support |
| Depends on | FND-01 v1.2, IAM-01 v1.2, IAM-02 v1.2, SEC-01 v1.2, CFG-01 v1.2, CLT-01 v1.2, KYC-01 v1.2, AML-01 v1.2 |
| Provides outcome to | Deposit, Withdrawal, Payout, Settlement, Ledger, Travel Rule, Trading Eligibility |

Base documents:
- 00_Licence_Scope_And_Feature_Lock_v1.3.md
- 01_Project_Charter_v1.3.md
- 02_Software_Requirement_Specification_v1.2.md
- 03_Master_Module_Index_v1.2.md
- 04_Role_And_Permission_Matrix_v1.2.md
- 05_Master_Workflow_Map_v1.2.md
- 06_Master_System_Rules_v1.2.md
- 07_Master_Data_Flow_v1.2.md
- 08_Master_Technical_Architecture_v1.2.md
- 09_Master_Security_Architecture_v1.2.md
- 10_Master_Testing_Strategy_v1.2.md
- 11_Master_Deployment_Strategy_v1.2.md
- FND-01_Platform_Foundation_Blueprint_Pack_v1.2
- IAM-01_Authentication_MFA_Session_Blueprint_Pack_v1.2
- IAM-02_RBAC_Permission_Guard_SoD_Blueprint_Pack_v1.2
- SEC-01_Audit_Log_Security_Monitoring_Blueprint_Pack_v1.2
- CFG-01_Feature_Flag_Licence_Lock_Blueprint_Pack_v1.2
- CLT-01_Client_Onboarding_Client_Profile_Blueprint_Pack_v1.2
- KYC-01_KYC_KYB_Verification_Blueprint_Pack_v1.2
- AML-01_Sanctions_PEP_Adverse_Media_Travel_Rule_Blueprint_Pack_v1.2


---

## 2. Module Purpose

WLT-01 controls whether a wallet address or fiat payout destination is eligible for use.

It answers:

```txt
Is this destination registered, verified, screened, whitelisted, approved, current, and allowed for this client/action before funds or assets move?
```

WLT-01 does not custody assets, hold keys, post ledger entries, or execute transfers. It only provides destination eligibility and whitelist status.

---

## 3. In Scope

WLT-01 covers:

1. Client wallet address registration.
2. Client wallet address ownership/control evidence.
3. Wallet address screening via blockchain analytics provider.
4. Wallet risk result capture.
5. Direct/indirect exposure category capture.
6. Wallet sanctions exposure capture.
7. Hosted/unhosted wallet classification where applicable.
8. Wallet whitelist approval.
9. Wallet whitelist cooling-off / activation delay.
10. Wallet revocation and immediate propagation.
11. Fiat payout destination registration.
12. Bank account / beneficiary ownership evidence.
13. Payout destination screening.
14. Payout destination whitelist approval.
15. Beneficiary mismatch review.
16. Destination client-side dual authorisation.
17. IAM-02 maker-checker / SoD approval.
18. AML-01 pre-transaction gate integration.
19. Travel Rule data handoff support.
20. Destination lifecycle status.
21. Ongoing re-screening and expiry.
22. List/vendor update re-screening.
23. Pre-transaction destination eligibility decision.
24. Evidence read/export.
25. Reconciliation jobs.

---

## 4. Out of Scope

WLT-01 does not implement:

1. Custody wallet service.
2. Private key storage.
3. Transaction signing.
4. Blockchain transaction broadcast.
5. Fiat payment execution.
6. Ledger posting.
7. Balance adjustment.
8. Client money safeguarding.
9. Trade execution.
10. Settlement DvP.
11. Exchange matching.
12. AML sanctions list ownership.
13. KYC/KYB verification ownership.
14. FIU/STR submission.

---

## 5. Critical Principles

### 5.1 Destination Whitelist Before Movement

No withdrawal, payout, transfer, settlement, or relevant deposit attribution may proceed unless destination eligibility is current and allowed.

Rules:

1. destination must be registered.
2. destination must be verified.
3. destination must be screened.
4. destination must be whitelisted.
5. whitelist must be active and not expired/revoked.
6. AML-01 pre-transaction gate must be current where required.
7. Travel Rule data must be complete where required.
8. destination must match client, mandate and action scope.

### 5.2 Wallet Screening Is Not Custody

WLT-01 does not provide wallet/custody service.

It screens and controls address eligibility only.

```txt
custody = out_of_scope
private_key = never_stored
```

### 5.3 Payout Whitelist Is Not Payment Execution

A whitelisted fiat payout destination does not execute payout or post ledger.

It only permits downstream payout/settlement module to continue its checks.

### 5.4 Client Status Binding

Destination eligibility depends on CLT-01 client status.

Destination must be denied/held if client is:

1. not approved.
2. suspended.
3. restricted.
4. closed.
5. under review due AML/KYC hit.
6. retail/ineligible where restricted by CFG-01.
7. lacking valid mandate.

### 5.5 AML-01 Pre-Transaction Gate

WLT-01 must call or verify AML-01 real-time pre-transaction sanctions gate before destination use where required.

Unknown, stale, missing, revoked, or hash-invalid AML decision fails closed.

### 5.6 Wallet Risk Screening

Wallet address must be screened against approved blockchain analytics provider/rules.

Screening result must include:

1. provider.
2. chain/network.
3. address.
4. asset scope.
5. screening timestamp.
6. risk score.
7. risk categories.
8. direct exposure flags.
9. indirect exposure flags.
10. sanctions exposure flags.
11. cluster/entity attribution where available.
12. payload hash.
13. validity/expiry.
14. SEC-01 audit reference.

### 5.7 Wallet Screening Result Is Action-Scoped

Wallet screening clear for one chain/asset/action is not automatically clear for all chains/assets/actions.

Rules:

1. chain/network must match.
2. asset scope must match where applicable.
3. destination address must match exactly after canonicalisation.
4. action type must match.
5. screening decision must be current.
6. risk categories must be within configured threshold.

### 5.8 Hosted / Unhosted Wallet Treatment

WLT-01 must classify wallet type where possible.

Rules:

1. hosted wallet requires counterparty/VASP data where applicable.
2. unhosted wallet may require ownership/control evidence.
3. high-risk or unverified unhosted wallet may require enhanced review.
4. Travel Rule requirements must be applied where threshold/scope triggers.
5. unsupported wallet type may be held/reviewed.

### 5.9 Wallet Ownership / Control Evidence

Client-provided wallet must be linked to the client or approved beneficiary/counterparty according to policy.

Evidence may include:

1. signed message / proof-of-control where supported.
2. exchange account ownership evidence where hosted.
3. beneficiary/counterparty confirmation where relevant.
4. Travel Rule counterparty data.
5. manual Compliance approval for exception cases.

### 5.10 Fiat Payout Destination Verification

Fiat payout destination must be verified before whitelist activation.

Verification includes:

1. beneficiary name.
2. bank name.
3. account number / IBAN / routing code.
4. country/jurisdiction.
5. beneficiary ownership relationship.
6. client mandate authorisation.
7. screening outcome.
8. evidence reference.
9. approval reference.

### 5.11 Beneficiary Name / Ownership Match

A payout destination beneficiary must match client, authorised beneficiary, or approved third-party beneficiary.

Mismatch requires review and approval.

Unapproved third-party payout destination is prohibited.

### 5.12 Client-Side Dual Authorisation

Destination creation, activation, high-risk change, and withdrawal/payout use must respect client-side dual authorisation where mandate requires.

Client maker cannot approve own destination or own payout destination change.

### 5.13 Maker-Checker / SoD

Sensitive destination actions require IAM-02 maker-checker and SoD.

Required for:

1. whitelist activation.
2. high-risk wallet approval.
3. third-party beneficiary approval.
4. destination revocation reversal.
5. whitelist cooling-off override.
6. vendor/manual risk override.
7. Travel Rule exception.
8. destination evidence export.

### 5.14 Cooling-Off / Activation Delay

New or changed payout/wallet destination must have configurable cooling-off before activation unless formally overridden by approved emergency process.

Rules:

1. cooling-off start and end recorded.
2. notification to client where safe.
3. no use before activation time.
4. override requires maker-checker and Compliance/Operations approval.
5. cooling-off does not bypass AML/Travel Rule checks.

### 5.15 Immediate Revocation

Revocation must propagate immediately.

Triggers:

1. client suspension/restriction/closure.
2. AML true hit.
3. KYC stale/fail.
4. wallet risk increase.
5. destination evidence invalid.
6. beneficiary mismatch.
7. Travel Rule failure.
8. mandate revocation.
9. vendor/list update hit.
10. manual Compliance decision.

### 5.16 Ongoing Monitoring / Re-Screening

Destinations must be re-screened:

1. periodically.
2. on AML list update.
3. on blockchain analytics provider update.
4. before high-risk payout/withdrawal.
5. on client status change.
6. on mandate/authorised-user change.
7. on chain risk model update.
8. on Travel Rule policy update.
9. on new exposure hit.

### 5.17 Travel Rule Support

WLT-01 must provide destination data needed by Travel Rule module / AML-01 where applicable.

Rules:

1. Travel Rule threshold/applicability from AML-01 must be respected.
2. originator/beneficiary/counterparty/VASP fields must be complete where required.
3. missing required data blocks or holds action.
4. Travel Rule sunrise handling must be respected.
5. Travel Rule screening outcome does not execute transfer.

### 5.18 Destination Decision Token

Destination eligibility decision is short-lived and action-scoped.

Token/reference must bind:

1. client ID.
2. destination ID.
3. destination type.
4. chain/network or fiat rail.
5. asset/currency where applicable.
6. action type.
7. client status version.
8. AML decision reference/hash.
9. wallet/payout risk result version.
10. whitelist version.
11. mandate version.
12. expiry.
13. SEC-01 audit reference.

### 5.19 Vendor / Provider Integrity

Wallet analytics and bank verification vendor results require:

1. approved provider.
2. source authentication.
3. payload hash.
4. result version.
5. validity window.
6. confidence/risk threshold.
7. outage fail-closed or approved manual fallback.
8. record-obtainability where relied upon.

### 5.20 Data Protection

Wallet/payout data is sensitive.

Rules:

1. bank account numbers are masked/tokenised where possible.
2. wallet addresses are restricted and logged.
3. beneficiary identity is protected.
4. evidence references only where possible.
5. sensitive read/export is SEC-01 logged.
6. retention and destruction are defined.
7. Travel Rule personal data is minimised.

---

## 6. Actors

| Actor | Role |
|---|---|
| Client Maker | Requests destination |
| Client Approver | Approves client-side destination request |
| Client Admin | Manages client authorised users/destinations |
| Operations User | Reviews payout/wallet destination |
| Compliance Officer / MLRO | Reviews high-risk destination |
| Super Admin | Limited admin; cannot bypass destination controls |
| Auditor | Read-only evidence |
| Vendor Service Account | Provides wallet/bank verification result |
| AML-01 Service | Provides sanctions/Travel Rule decision |
| CLT-01 Service | Provides client status/mandate |
| KYC-01 Service | Provides verified identity/beneficiary data |
| Settlement/Payout Service | Consumes destination eligibility |
| System Job | Rescreening/reconciliation/expiry |

---

## 7. Dependencies

### 7.1 Upstream

1. CLT-01 client status, mandate, authorised users.
2. KYC-01 verified identity/beneficiary evidence.
3. AML-01 pre-transaction sanctions gate and Travel Rule screening support.
4. CFG-01 feature/licence gate.
5. IAM-02 maker-checker/SoD/client dual authorisation.
6. SEC-01 audit/sensitive read logging.
7. FND-01 correlation/idempotency/outbox.
8. Wallet analytics vendor.
9. Bank verification provider.

### 7.2 Downstream

1. Deposit module.
2. Withdrawal/payout module.
3. Settlement module.
4. Ledger module.
5. Travel Rule module.
6. Trading eligibility module.
7. Reconciliation/reporting module.

---

## 8. Components

| Component | Description |
|---|---|
| Wallet Registration Service | Registers wallet address request |
| Wallet Canonicalisation Service | Canonical chain/address normalisation |
| Wallet Ownership Evidence Service | Captures wallet control/ownership refs |
| Wallet Screening Service | Runs blockchain analytics screening |
| Wallet Risk Engine | Evaluates risk categories and thresholds |
| Payout Destination Service | Registers fiat payout destination |
| Beneficiary Verification Service | Verifies beneficiary match/relationship |
| Whitelist Workflow Engine | Manages activation/cooling-off/revocation |
| Destination Decision Engine | Computes short-lived eligibility token |
| AML Gate Adapter | Calls/verifies AML-01 pre-transaction gate |
| Travel Rule Data Adapter | Prepares Travel Rule party data |
| Client Mandate Adapter | Verifies CLT/IAM-02 client-side mandate |
| Vendor Result Inbox | Receives wallet/bank vendor results |
| Evidence Access Service | Controlled evidence read/export |
| Ongoing Monitoring Scheduler | Periodic/list/model update rescreening |
| Reconciliation Jobs | Detect destination/access drift |

---

## 9. Functional Requirements

### WLT1-FR-001 Wallet Registration

The platform shall allow controlled wallet address registration request.

### WLT1-FR-002 Wallet Canonicalisation

The platform shall canonicalise wallet address by chain/network before screening/use.

### WLT1-FR-003 Wallet Ownership Evidence

The platform shall capture ownership/control evidence for wallet address where required.

### WLT1-FR-004 Wallet Screening

The platform shall screen wallet address using approved provider/risk rules.

### WLT1-FR-005 Wallet Risk Outcome

The platform shall compute wallet risk outcome.

### WLT1-FR-006 Wallet Whitelist Approval

The platform shall require approval before wallet whitelist activation.

### WLT1-FR-007 Payout Destination Registration

The platform shall allow controlled fiat payout destination registration.

### WLT1-FR-008 Payout Destination Verification

The platform shall verify payout destination and beneficiary relationship.

### WLT1-FR-009 Beneficiary Mismatch Review

The platform shall route beneficiary mismatch to review and block until approved.

### WLT1-FR-010 Destination Cooling-Off

The platform shall enforce destination cooling-off/activation delay.

### WLT1-FR-011 Destination Revocation

The platform shall support immediate destination revocation and propagation.

### WLT1-FR-012 Client-Side Dual Authorisation

The platform shall enforce client-side dual authorisation for destination actions where mandate requires.

### WLT1-FR-013 AML Gate

The platform shall require AML-01 pre-transaction gate for destination use where required.

### WLT1-FR-014 Travel Rule Data

The platform shall provide/validate Travel Rule destination data where required.

### WLT1-FR-015 Destination Decision Token

The platform shall issue short-lived action-scoped destination eligibility decision.

### WLT1-FR-016 Vendor Result Integrity

The platform shall verify vendor source, payload hash, validity and threshold.

### WLT1-FR-017 Ongoing Rescreening

The platform shall re-screen destinations on periodic, list update, provider update, status change or risk trigger.

### WLT1-FR-018 Sensitive Read Logging

The platform shall log sensitive destination/evidence read/export through SEC-01.

### WLT1-FR-019 Reconciliation

The platform shall reconcile active destinations, client status, AML gate, vendor results, whitelist state and downstream use.

### WLT1-FR-020 No Movement Execution

The platform shall not execute transfers, post ledger, sign blockchain transactions or move funds/assets.

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Destination whitelist | Required before movement |
| Wallet private keys | Never stored |
| AML pre-transaction gate | Required where applicable |
| Unknown/stale AML decision | Deny/hold |
| Wallet screening result | Required |
| Beneficiary verification | Required |
| Client-side dual authorisation | Required by mandate |
| Maker-checker | Required for sensitive destination actions |
| Cooling-off | Required/configurable |
| Immediate revocation | Required |
| Travel Rule data | Required where applicable |
| Vendor result integrity | Required |
| Sensitive read/export | SEC-01 logged |
| Test coverage | Critical controls 100% |

---

## 11. Prohibited Behaviours

WLT-01 must not allow:

1. Withdrawal/payout/settlement to unwhitelisted destination.
2. Destination use before screening.
3. Destination use with stale AML decision.
4. Destination use with revoked whitelist.
5. Destination use before cooling-off ends.
6. Wallet private key storage.
7. Blockchain transaction signing.
8. Ledger posting.
9. Payment execution.
10. AML true-hit destination allowed.
11. Wallet high-risk result overridden without approval.
12. Third-party beneficiary payout without approval.
13. Beneficiary mismatch treated as pass.
14. Client maker approving own destination.
15. Super Admin bypass whitelist.
16. Break-glass approve destination.
17. Service account approve whitelist.
18. Direct DB edit of whitelist status.
19. Travel Rule missing data treated as clear.
20. Vendor result accepted without source authentication/hash.
21. Sensitive destination read/export without SEC-01 audit.
22. Revoked client/mandate still using destination.
23. Destination decision token reused outside action/scope.
24. Chain/address mismatch treated as same destination.
25. AML clear or wallet clear granting transfer execution.

---

## 12. Acceptance Criteria

WLT-01 is accepted only if:

1. Wallet registration defined.
2. Wallet canonicalisation defined.
3. Wallet ownership evidence defined.
4. Wallet screening defined.
5. Wallet risk outcome defined.
6. Payout destination registration defined.
7. Beneficiary verification defined.
8. Whitelist approval defined.
9. Cooling-off defined.
10. Immediate revocation defined.
11. Client-side dual authorisation defined.
12. AML-01 pre-transaction gate integration defined.
13. Travel Rule data support defined.
14. Destination decision token defined.
15. Vendor integrity defined.
16. Sensitive read/export defined.
17. Reconciliation defined.
18. Tests defined and passed.

---

## 13. Open Items

1. Final wallet analytics provider.
2. Final wallet risk scoring thresholds.
3. Final high-risk wallet categories.
4. Final chain/network support list.
5. Final wallet proof-of-control requirements.
6. Final fiat bank verification source.
7. Final payout beneficiary relationship rules.
8. Final destination cooling-off period.
9. Final high-risk destination approval matrix.
10. Final Travel Rule destination data payload.
11. Final vendor outage/manual fallback policy.
12. Final whitelist decision token TTL.
13. Final rescreening frequency.
14. Final retention schedule.
