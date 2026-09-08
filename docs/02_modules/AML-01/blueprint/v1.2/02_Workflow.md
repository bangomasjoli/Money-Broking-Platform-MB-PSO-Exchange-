# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 02 Workflow

## 1. Workflow Scope

AML-01 workflows cover screening case creation, sanctions/PEP/adverse-media/watchlist screening, match review, false-positive clearance, true-hit escalation, outcome publication, EDD trigger to KYC-01, ongoing rescreening, Travel Rule screening support, STR escalation, tipping-off protection and reconciliation.

---

## 2. WF-AML01-01 Screening Case Creation

### Trigger

CLT-01/KYC-01 sends screening handoff.

### Steps

1. Receive handoff.
2. Verify source module and payload hash.
3. Verify party/client/application reference.
4. Determine screening types required.
5. Create screening case.
6. Set delivery status to received.
7. Set outcome status to pending.
8. Emit SEC-01 audit event.
9. Acknowledge delivery to sender.

### Rules

1. Delivery acknowledgement is not screening clear.
2. Case creation does not clear onboarding.
3. Invalid handoff is rejected/dead-lettered/escalated.

---

## 3. WF-AML01-02 Sanctions / PEP / Adverse Media Screening

### Steps

1. Load screening case.
2. Select approved list/provider and version.
3. Generate search input hash.
4. Send to vendor/list provider or internal matcher.
5. Receive result.
6. Verify source authentication and payload hash.
7. Store candidate matches and scores.
8. Apply threshold policy.
9. Set case to clear, possible_match, review_required, or hit.
10. Emit SEC-01 audit event.

---

## 4. WF-AML01-03 Match Review

### Steps

1. Analyst reviews possible match.
2. Compare candidate match data with client/party identity.
3. Record decision: false_positive, true_hit, inconclusive, needs_more_info.
4. False positive requires reason/evidence.
5. True hit requires Compliance/MLRO escalation.
6. Inconclusive remains review_required.
7. Emit SEC-01 audit event.

### Rules

1. Service account cannot make decision.
2. Super Admin cannot clear true hit.
3. Break-glass cannot clear true hit.
4. Material list/input change requires revalidation.

---

## 5. WF-AML01-04 True Hit Escalation

### Steps

1. Mark match as true hit.
2. Restrict/suspend client/party through CLT-01 feedback.
3. Send EDD/remediation trigger to KYC-01.
4. Create restricted suspicion/STR case if policy requires.
5. Notify Compliance/MLRO.
6. Suppress client-facing unsafe notification.
7. Emit SEC-01 Critical audit event.
8. Monitor remediation/decision.

---

## 6. WF-AML01-05 Outcome Computation and Publication

### Steps

1. Load screening case and match decisions.
2. Compute outcome: clear/hit/pending/stale/review_required.
3. Set validity/review date.
4. Publish outcome to CLT-01.
5. Publish EDD/remediation trigger to KYC-01 where required.
6. Emit SEC-01 audit event.

### Hard Blocks

1. Sanctions true hit.
2. Unresolved possible match.
3. Stale list/result.
4. Missing list/provider version.
5. Travel Rule required data missing where applicable.
6. Vendor result unauthenticated.

---

## 7. WF-AML01-06 Ongoing Rescreening

### Trigger

List update, periodic schedule, profile change, authorised-party/UBO change, jurisdiction change, or downstream trigger.

### Steps

1. Identify affected clients/parties.
2. Create rescreening run.
3. Screen against updated list/provider version.
4. Compare previous false-positive/clear decisions.
5. If new/changed match appears, create review case.
6. If hit, restrict/suspend through CLT-01 and trigger KYC-01 EDD.
7. Publish updated outcome.
8. Emit audit event.

---

## 8. WF-AML01-07 Travel Rule Screening Support

### Trigger

Travel Rule data is required for transfer/deposit/withdrawal or counterparty event.

### Steps

1. Receive originator/beneficiary/counterparty/VASP data.
2. Validate required data completeness.
3. Screen originator and beneficiary.
4. Screen VASP/counterparty where applicable.
5. Return clear/hit/missing_data/review_required outcome.
6. Emit SEC-01 audit event.

### Rules

1. Missing required Travel Rule data cannot be treated as clear.
2. Hit routes to Compliance/MLRO.
3. Travel Rule outcome does not post ledger or approve transfer by itself.

---

## 9. WF-AML01-08 STR / Suspicion Case

### Trigger

True hit, suspicious match pattern, analyst escalation, transaction monitoring trigger, or MLRO decision.

### Steps

1. Create restricted STR/suspicion case.
2. Apply tipping-off guard.
3. Restrict case access to Compliance/MLRO and approved roles.
4. Capture reason and evidence refs.
5. Prepare STR decision record.
6. Record filing decision/status.
7. Suppress unsafe client-facing communication.
8. Emit SEC-01 sensitive audit event.

---

## 10. WF-AML01-09 Sensitive Read / Export

### Steps

1. User requests screening/STR evidence read/export.
2. IAM-02 permission check.
3. Step-up/approval where required.
4. SEC-01 sensitive read/export event emitted.
5. Redacted data returned according to role/scope.
6. Export expires.

---

## 11. WF-AML01-10 Reconciliation

### Scheduled Checks

1. Handoff without screening case.
2. Screening case without outcome.
3. Clear outcome with unresolved match.
4. True hit without CLT restriction feedback.
5. True hit without KYC EDD trigger where required.
6. List update without rescreening.
7. Stale outcome still treated as clear.
8. Outcome not published to CLT.
9. Sensitive read/export without SEC-01 audit.
10. STR case visible to unauthorised role.

---

## 12. WF-AML01-11 Pre-Transaction Sanctions Gate

### Trigger

Payment, settlement, payout, deposit, withdrawal, wallet/counterparty event, Travel Rule event, or MON/settlement action requests sanctions clearance.

### Steps

1. Receive transaction-screening request with action context.
2. Verify caller/module is authorised.
3. Validate minimum screening input dataset.
4. Check current list freshness and latest list version.
5. Screen client, counterparty, originator, beneficiary, VASP/counterparty and relevant ownership/control parties.
6. Apply sanctions true-hit hard block.
7. If possible match, hold/review according to policy.
8. If clear, return short-lived action-scoped decision.
9. Emit SEC-01 audit event.

### Fail-Closed Conditions

1. Missing input dataset.
2. Stale list/freshness unknown.
3. Unresolved possible match.
4. True hit.
5. AML outcome stale/revoked.
6. Vendor/source unavailable without approved manual fallback.

---

## 13. WF-AML01-12 List Update SLA and Interim Blocking

### Trigger

Sanctions/PEP/watchlist provider publishes new list/version.

### Steps

1. Record list update and list freshness proof.
2. Identify affected active clients/parties/counterparties using screening scope and KYC-01 UBO graph.
3. Apply interim block/restriction to affected parties according to policy.
4. Start SLA timer.
5. Run rescreening.
6. Publish updated outcomes and revocations.
7. Remove interim block only after clear/resolved outcome.
8. Emit Critical alert if SLA breached.

---

## 14. WF-AML01-13 Ownership-Based Sanctions / 50 Percent Rule

### Trigger

Initial screening, KYC-01 ownership graph update, UBO change, list update, or pre-transaction gate.

### Steps

1. Pull KYC-01 UBO/control graph.
2. Verify graph is current and complete.
3. Screen all natural-person UBOs/controllers.
4. Aggregate direct and indirect sanctioned ownership/control.
5. Apply configured 50 percent ownership/control rule.
6. If threshold met, treat entity as sanctioned/restricted.
7. If graph incomplete/stale, return review_required/pending, not clear.
8. Publish outcome to CLT-01 and KYC trigger where required.

---

## 15. WF-AML01-14 STR Clock and Pending Transaction Handling

### Trigger

Suspicion forms from true hit, analyst concern, Travel Rule hit, transaction-monitoring trigger, or MLRO escalation.

### Steps

1. Create restricted STR/suspicion case.
2. Record suspicion_formed_at.
3. Start suspicion-to-MLRO deadline.
4. Start statutory FIU filing deadline according to configured policy.
5. Determine transaction handling: proceed, hold, block, or escalate.
6. Use safe reason code to avoid tipping-off.
7. Escalate before SLA breach.
8. Record MLRO decision and filing status.
9. Emit SEC-01 Critical audit event.

---

## 16. WF-AML01-15 Sanctions False-Positive Reattestation

### Trigger

Sanctions possible-match decision, scheduled re-attestation, list change, input/profile change, or threshold change.

### Steps

1. Require dual Compliance/MLRO review for sanctions false positive.
2. Record decision reason, evidence, list version and input hash.
3. Set expiry/re-attestation date.
4. Invalidate decision on material list/input/profile change.
5. Enforce threshold floor.
6. Emit SEC-01 audit event.

---

## 17. WF-AML01-16 De-Listing Controlled Unblock

### Trigger

A previously matched person/entity is removed from list or vendor marks de-listed.

### Steps

1. Create de-listing review task.
2. Rescreen using latest list and input.
3. Compliance/MLRO reviews historical hit and current status.
4. If approved, publish controlled unblock to CLT-01.
5. Preserve STR/suspicion history and audit.
6. Emit SEC-01 audit event.

---

## 18. WF-AML01-17 Screening Input Quality Gate

### Trigger

Any screening run or pre-transaction screening request.

### Steps

1. Validate party type.
2. Validate minimum required identity/entity fields.
3. Check KYC-01 verified data availability where applicable.
4. If input incomplete/thin, return review_required/pending.
5. If input complete, proceed to screening.
6. Record input quality status.
7. Emit audit event for incomplete input blocking.
