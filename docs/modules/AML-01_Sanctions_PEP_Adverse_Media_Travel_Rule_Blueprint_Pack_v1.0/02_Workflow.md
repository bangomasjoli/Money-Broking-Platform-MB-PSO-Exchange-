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
