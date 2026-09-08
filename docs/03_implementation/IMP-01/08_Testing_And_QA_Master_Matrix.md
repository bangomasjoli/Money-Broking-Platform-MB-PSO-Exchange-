# IMP-01 AIX Master Implementation Handover
## 08 Testing And QA Master Matrix

## 1. Test Levels

1. unit tests.
2. service integration tests.
3. API contract tests.
4. database migration tests.
5. permission/SoD tests.
6. audit event tests.
7. error handling tests.
8. E2E fund-flow tests.
9. security tests.
10. compliance tests.
11. UAT tests.
12. go-live dry-run tests.

## 2. Critical Test Suites

### 2.1 Control Plane

1. authentication/MFA.
2. session timeout.
3. RBAC/SoD.
4. audit append-only.
5. licence-lock.

### 2.2 Compliance

1. onboarding eligibility.
2. KYC/KYB.
3. AML/sanctions/PEP/adverse media.
4. Travel Rule.
5. wallet screening.
6. payout whitelist.

### 2.3 Money Flow

1. deposit receipt to LED credit.
2. withdrawal reserve to payout finality.
3. quote to LP fill to LED settlement.
4. value conservation.
5. safeguarding.
6. reversals/returns.

### 2.4 Assurance / Resilience

1. E2E saga.
2. reconciliation coverage.
3. incident freeze effectiveness.
4. recovery resume gate.
5. portal display truth.

## 3. Mandatory Negative Tests

1. direct ledger edit blocked.
2. direct balance edit blocked.
3. audit delete blocked.
4. permission bypass blocked.
5. Exchange route blocked.
6. payout without reserve blocked.
7. trade without LP fill blocked.
8. AML hit ignored blocked.
9. wallet unapproved destination blocked.
10. REC source mutation blocked.
11. INC freeze release without resume blocked.
12. PRT cached favourable status blocked.

## 4. Test Evidence

Each critical test must produce:

1. test case ID.
2. module code.
3. input data.
4. expected result.
5. actual result.
6. logs/audit refs.
7. screenshots where relevant.
8. pass/fail status.
9. reviewer sign-off.
