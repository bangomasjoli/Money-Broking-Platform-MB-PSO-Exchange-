# E2E-01 Cross-Module End-to-End Fund-Flow Review
## 12 Handover For Implementation

## 1. Implementation Approach

Implementation should not start by coding TRD/LED first.

Recommended order:

1. FND-01 Platform Foundation.
2. IAM-01 Authentication/MFA/session.
3. IAM-02 RBAC/permission guard/SoD.
4. SEC-01 Audit/event evidence.
5. CFG-01 Feature/licence lock.
6. CLT-01 Client profile/mandate.
7. KYC-01 KYC/KYB verification.
8. AML-01 Screening/pre-transaction gate.
9. WLT-01 Destination/source controls.
10. LED-01 Ledger/settlement/safeguarding.
11. TRD-01 Quote/trade/LP execution.
12. E2E integration tests.

## 2. Claude Code Implementation Prompt

```txt
Read PROJECT_HANDOVER.md and MODULE_STATUS.md first.
Do not scan the full repo.
Implement one module only.
Search before opening files.
Use focused diffs.
Do not implement Exchange features.
Do not implement future modules.
Do not bypass IAM/CFG/SEC controls.
Preserve the accepted blueprint contracts.

Current module: [INSERT MODULE CODE].
First: search repository for existing patterns.
Second: propose minimum files to change.
Third: wait for approval before broad structural edits.
```

## 3. E2E Implementation Rules

1. Every module action has request/correlation ID.
2. Every critical action has SEC-01 audit.
3. Every financial action has idempotency key.
4. Every decision token is versioned, scoped, hash-bound and expiring.
5. Every money movement fails closed on stale decision.
6. Every ledger post is double-entry and hash-chained.
7. Every trade fill is externally conserved against LP fill.
8. Every Exchange feature is structurally absent and runtime-blocked.

## 4. Development Session Cost Control

Use Claude Sonnet for normal coding/testing/refactoring.

Use Opus only for:

1. architecture review.
2. ledger/safeguarding review.
3. security/compliance review.
4. cross-module fund-flow review.
5. final critical issue review.

Use one module per session.

After each module:

1. update MODULE_STATUS.md.
2. save review notes.
3. compact or start fresh session.
4. do not force Claude to reread whole repo.
