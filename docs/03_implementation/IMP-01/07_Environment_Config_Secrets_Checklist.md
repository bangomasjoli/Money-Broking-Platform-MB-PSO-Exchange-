# IMP-01 AIX Master Implementation Handover
## 07 Environment Config Secrets Checklist

## 1. Environments

Recommended:

```txt
local
dev
test
uat
staging
production
dr
```

## 2. Required Configuration Categories

1. database connection.
2. audit log storage.
3. encryption keys.
4. session configuration.
5. MFA configuration.
6. email/SMS notification provider.
7. KYC/KYB provider.
8. AML/sanctions provider.
9. wallet screening provider.
10. custodian/provider endpoints.
11. bank/payment rail endpoints.
12. LP endpoints.
13. feature flags.
14. licence-lock defaults.
15. reconciliation schedules.
16. incident notification matrix.
17. export/masking policy.
18. portal URLs.

## 3. Secrets

Secrets must include:

1. database credentials.
2. JWT/session signing keys.
3. encryption keys.
4. provider API keys.
5. webhook signing secrets.
6. mTLS certificates.
7. HSM/KMS references.
8. audit anchor credentials.
9. CI/CD deployment tokens.

Rules:

1. no secrets in repo.
2. no secrets in frontend.
3. no secrets in logs.
4. no secrets in screenshots.
5. rotate production secrets.
6. separate environment secrets.

## 4. Feature Flag Defaults

Production defaults:

```txt
exchange_runtime = disabled
order_book = disabled
matching_engine = disabled
client_to_client_matching = disabled
market_making = disabled
principal_dealing = disabled
aix_spread_markup = disabled
retail_onboarding = disabled_by_default
```

## 5. Monitoring Alerts

Minimum alerts:

1. failed login spike.
2. permission bypass attempt.
3. audit append failure.
4. licence-lock violation attempt.
5. ledger imbalance.
6. safeguarding deficit.
7. AML/sanctions critical hit.
8. wallet high-risk hit.
9. payout failure/return.
10. LP timeout/late fill.
11. reconciliation critical break.
12. freeze partial/ineffective.
13. export token replay.
14. Exchange route attempt.
