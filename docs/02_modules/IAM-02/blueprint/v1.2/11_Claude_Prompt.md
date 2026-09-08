# IAM-02 RBAC / Permission Guard / SoD  
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this IAM-02 RBAC / Permission Guard / SoD Blueprint Pack v1.2 as a principal fintech platform architect, regulated fintech security architect, IAM/RBAC architect, SoD reviewer, approval-control reviewer, and compliance reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending.
- MVP supports institutional and HNWI/professional clients only.
- Retail onboarding is disabled by default.
- FND-01 Platform Foundation v1.2 is accepted.
- IAM-01 Authentication / MFA / Session v1.2 is accepted.
- IAM-02 is the permanent authorization, maker-checker, permission guard, approval-execution binding, protected-action registry, and SoD layer.
- IAM-02 retires IAM-01's interim MFA-reset approval control and becomes the permanent approval engine.
- IAM-02 must integrate with IAM-01 step-up/recent-auth assertions.
- IAM-02 must not implement authentication, KYC, AML, ledger, settlement, trading, or Exchange features.
- AIX spread markup, principal dealing, market making, internal matching, client-to-client matching, public order book, matching engine, and public exchange trading are blocked.

Review for:
1. Missing RBAC controls.
2. Missing permission guard controls.
3. Missing maker-checker approval controls.
4. Missing self-approval prevention.
5. Missing SoD conflict controls.
6. Missing step-up integration with IAM-01.
7. Missing delegated permission controls.
8. Missing temporary permission controls.
9. Missing break-glass controls.
10. Missing permission cache invalidation/revocation controls.
11. Missing client-side dual authorization controls.
12. Missing service-account controls.
13. Missing sensitive read/audit/evidence controls.
14. Missing licence-lock/prohibited-permission controls.
15. Missing approval-to-execution binding / payload hash / decision token controls.
16. Missing protected-action registry or guard-coverage controls.
17. Missing SoD risk acceptance, meta-SoD, or matrix integrity controls.
18. Missing break-glass privilege ceiling / whitelist controls.
19. Missing interim CFG-01 licence-lock or SEC-01 audit-authority contracts.
20. Missing API, DB, workflow, state-machine, permission, risk, test, or go-live controls.
21. Any IAM-02 feature that could bypass licence lock, audit, SoD, maker-checker, or enable Exchange/principal-dealing behaviour.
22. Any conflict with master docs 00–11, FND-01 v1.2, or IAM-01 v1.2.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional IAM-02 requirements or parameters to add.
```

## Claude Sonnet / Claude Code Prompt

Do not use this until Claude Opus accepts the blueprint.

```txt
Implement IAM-02 RBAC / Permission Guard / SoD only.

Use Claude Sonnet in Claude Code.

Do not implement:
- Login/MFA/session logic except integration with IAM-01.
- KYC/AML.
- Trading.
- Ledger.
- Settlement.
- Exchange features.

Implement:
- role catalogue.
- permission catalogue.
- permission guard.
- role-permission assignment.
- user-role assignment.
- maker-checker approval engine.
- SoD conflict matrix.
- delegation.
- temporary permissions.
- break-glass access.
- permission cache invalidation.
- client-side dual authorization support.
- permission audit events.
- tests.

Search before opening files. Use focused diffs. Work on IAM-02 only.
```

## Final Verification Note

IAM-02 v1.2 is accepted / final verified.

v1.2 only folds in cosmetic markdown, typo, and heading fixes after v1.1 was verified as resolving all 5 critical gaps and all 7 recommended corrections.
