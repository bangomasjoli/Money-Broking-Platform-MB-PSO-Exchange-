# IMP-01 AIX Master Implementation Handover
## 06 Database Migration Order

## 1. Migration Order

```txt
001_fnd_core
002_iam_auth_session
003_iam_rbac_permissions_sod
004_sec_audit_security
005_cfg_feature_licence_lock
006_clt_client_profile
007_kyc_verification
008_aml_screening_travel_rule
009_wlt_wallet_destination
010_led_ledger_safeguarding
011_dep_deposit_execution
012_wdr_withdrawal_execution
013_trd_trade_execution
014_e2e_saga_correlation
015_rec_reconciliation_reporting
016_inc_incident_freeze_recovery
017_prt_portal_workflows
```

## 2. Migration Rules

1. migrations are forward-only in production.
2. destructive migrations require explicit approval.
3. ledger tables require extra review.
4. audit tables require append-only controls.
5. permission tables require seed review.
6. no Exchange tables/routes unless disabled by CFG and not runtime-active.
7. migration checksums retained.
8. rollback plan documented.

## 3. Seed Data

Required seed data:

1. system roles.
2. permission definitions.
3. prohibited permissions.
4. feature flags.
5. licence-lock defaults.
6. audit event catalogue.
7. error code catalogue.
8. report templates.
9. incident severity matrix.
10. portal client-safe reason codes.
11. message templates.
12. test users for sandbox/UAT.

## 4. Production Migration Gates

Before production migration:

1. backup complete.
2. migration dry-run complete.
3. migration checksum verified.
4. rollback point identified.
5. money-flow quiescence confirmed where applicable.
6. sign-off recorded.
