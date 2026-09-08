# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 07 Permission Rules

## 1. Permission Namespace

```txt
aml1.<resource>.<action>
```

---

## 2. Permissions

| Permission | Purpose |
|---|---|
| `aml1.case.read` | Read screening case |
| `aml1.case.read_sensitive` | Read sensitive screening case |
| `aml1.case.create` | Create case |
| `aml1.screening.run` | Run screening |
| `aml1.vendor_result.receive` | Receive vendor result |
| `aml1.match.review` | Review match |
| `aml1.false_positive.decide` | Decide false positive |
| `aml1.true_hit.escalate` | Escalate true hit |
| `aml1.outcome.compute` | Compute outcome |
| `aml1.outcome.publish` | Publish outcome |
| `aml1.rescreening.run` | Run rescreening |
| `aml1.travel_rule.screen` | Run Travel Rule screening |
| `aml1.str_case.create` | Create STR/suspicion case |
| `aml1.str_case.read` | Read STR/suspicion case |
| `aml1.str_case.decision` | Record STR filing decision |
| `aml1.evidence.export` | Export AML evidence |
| `aml1.admin.configure` | Configure AML module |
| `aml1.pre_transaction.screen` | Run pre-transaction sanctions gate |
| `aml1.list_update.manage` | Manage list update/rescreen SLA |
| `aml1.ownership_sanctions.screen` | Screen ownership-based sanctions |
| `aml1.false_positive.reattest` | Re-attest standing false positive |
| `aml1.str_clock.manage` | Manage STR statutory clock |
| `aml1.delisting.review` | Review de-listing/unblock |
| `aml1.travel_rule_policy.manage` | Manage Travel Rule threshold/sunrise policy |

---

## 3. Maker-Checker Required

Required for:

1. false-positive decision where policy says.
2. true-hit escalation.
3. sanctions hit clearance/closure.
4. PEP/adverse-media high-risk decision.
5. STR filing/not-filing decision.
6. Travel Rule missing-data exception where policy permits.
7. list/provider configuration.
8. threshold configuration.
9. evidence export.
10. stale outcome reinstatement.
11. sanctions false-positive decision.
12. sanctions standing false-positive re-attestation.
13. match threshold floor change.
14. de-listing unblock.
15. STR pending-transaction handling decision.
16. Travel Rule threshold/sunrise policy change.

---

## 4. SoD Rules

1. Analyst who marks false positive cannot be sole approver where approval required.
2. True-hit reviewer cannot approve own closure.
3. MLRO/Compliance decision required for STR filing/not-filing.
4. Service account cannot make match decision.
5. Super Admin cannot clear sanctions true hit.
6. Break-glass cannot clear sanctions true hit.
7. Client-facing role cannot access STR suspicion details.
8. Outcome publisher cannot alter outcome payload.

---

## 5. Outcome Rules

AML clear requires:

```txt
sanctions = clear_or_false_positive_approved
pep = clear_or_policy_approved
adverse_media = clear_or_policy_approved
watchlist = clear_or_policy_approved
travel_rule = complete_and_clear where applicable
```

Hard block:

```txt
sanctions_true_hit
unresolved_possible_match
stale_screening
missing_list_version
vendor_result_unauthenticated
travel_rule_required_data_missing
```

## 6. v1.1 Elevated Rules

1. Pre-transaction sanctions gate cannot be bypassed where required.
2. Sanctions false-positive requires dual Compliance/MLRO review.
3. Match threshold cannot be configured below non-suppressible floor.
4. De-listing does not automatically unblock; approval required.
5. STR clock deadline cannot be removed or silently extended.
6. Incomplete screening input cannot be clear.
7. Ownership-based sanctions using KYC-01 graph must be evaluated.
