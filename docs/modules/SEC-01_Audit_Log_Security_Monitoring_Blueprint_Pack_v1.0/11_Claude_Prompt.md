# SEC-01 Audit Log / Security Monitoring  
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this SEC-01 Audit Log / Security Monitoring Blueprint Pack v1.0 as a principal fintech platform architect, regulated fintech security architect, audit/evidence architect, tamper-evident logging specialist, and compliance reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending; Exchange features are locked.
- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.
- IAM-02 RBAC / Permission Guard / SoD accepted v1.2.
- SEC-01 becomes the authoritative audit store and security monitoring layer.
- IAM-01 and IAM-02 currently have interim local audit/evidence indexes; SEC-01 must define the authoritative handoff/reconciliation.
- SEC-01 must support regulated fintech evidence, security monitoring, alerting, tamper evidence, sensitive read logging, and export control.
- SEC-01 must not implement authentication, RBAC, feature flags, KYC, AML, ledger, settlement, trading, or Exchange features.

Review for:
1. Missing immutable audit log controls.
2. Missing tamper-evident hash-chain/batch seal controls.
3. Missing audit event schema validation controls.
4. Missing audit failure fail-closed controls.
5. Missing security monitoring/alerting controls.
6. Missing sensitive audit read logging controls.
7. Missing evidence export controls.
8. Missing IAM-01/IAM-02 interim audit handoff controls.
9. Missing retention/legal hold/archive controls.
10. Missing audit reconciliation controls.
11. Missing audit access-control/SoD controls.
12. Missing service-account restrictions.
13. Any pathway to audit deletion, modification, disablement, or bypass.
14. Any inconsistency with FND-01, IAM-01, IAM-02, or master docs 00–11.
15. Any additional parameters required before acceptance.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional SEC-01 requirements or parameters to add.
```
