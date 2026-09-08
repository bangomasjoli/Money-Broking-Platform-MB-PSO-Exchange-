# CLT-01 Client Onboarding / Client Profile
## 07 Permission Rules

## 1. Permission Namespace

```txt
clt1.<resource>.<action>
```

---

## 2. Permissions

| Permission | Purpose |
|---|---|
| `clt1.application.create` | Create onboarding application |
| `clt1.application.read` | Read application |
| `clt1.application.update` | Update application |
| `clt1.application.submit` | Submit application |
| `clt1.application.review` | Review application |
| `clt1.application.approve` | Approve application |
| `clt1.application.reject` | Reject application |
| `clt1.application.hold` | Hold application |
| `clt1.client.read` | Read client profile |
| `clt1.client.read_sensitive` | Read sensitive profile |
| `clt1.client.update` | Update profile |
| `clt1.client.suspend` | Suspend client |
| `clt1.client.close` | Close client |
| `clt1.client_class.change` | Change client class |
| `clt1.authorised_user.manage` | Manage authorised users |
| `clt1.mandate.manage` | Manage mandate |
| `clt1.duplicate.review` | Review duplicates |
| `clt1.evidence_export.request` | Request evidence export |
| `clt1.evidence_export.approve` | Approve evidence export |

---

## 3. Maker-Checker Required

Required for:

1. Final onboarding approval.
2. Client-class change.
3. Sensitive profile amendment.
4. Client status suspension/closure/reactivation.
5. Authorised user addition/removal for institutional clients.
6. Mandate creation/change.
7. Evidence export.
8. Duplicate resolution override.
9. High-risk jurisdiction exception.
10. Any manual override of onboarding status.

---

## 4. SoD Rules

1. Application reviewer cannot approve own review where maker-checker applies.
2. Staff who creates client profile cannot be sole final approver.
3. Client-class change requester cannot approve own change.
4. Duplicate reviewer cannot approve own duplicate override if they created the application.
5. Client maker cannot approve own client-side action.
6. Service account cannot approve onboarding.
7. Super Admin cannot bypass KYC/AML/licence gates.
8. Break-glass cannot approve onboarding or client-class upgrade.

---

## 5. Client Status Access Rules

| Status | Trading | Deposit | Withdrawal | Profile Edit |
|---|---|---|---|---|
| draft | No | No | No | Yes |
| submitted | No | No | No | Limited |
| pending_kyc | No | No | No | Limited |
| pending_aml | No | No | No | Limited |
| under_review | No | No | No | Limited |
| approved | Downstream controlled | Downstream controlled | Downstream controlled | Controlled |
| suspended | No | No | No except remediation | Controlled |
| closed | No | No | No | No except audit/evidence |

---

## 6. CFG-01 Feature Gates

Required CFG feature gates:

1. `onboarding.institutional`
2. `onboarding.hnwi`
3. `onboarding.professional`
4. `onboarding.retail_default`
5. `client_profile.create`
6. `client_mandate.manage`
7. `client_authorised_user.manage`
8. `client_evidence.export`
