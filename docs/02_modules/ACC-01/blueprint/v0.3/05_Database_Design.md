# ACC-01 Account Structure
## 05 Database Design (v0.3)

**Design only. No migration is written or authorised by this pack.** DDL below is illustrative of constraints, not a migration file. The migration number is assigned when the implementation task is approved (head is `071` at baseline `5a4f872`; other modules may take numbers first — do not pre-assign).

## 1. Schema, role, isolation

```txt
schema:      acc1
runtime role: role_acc1_runtime
```

Rules:

1. `role_acc1_runtime` has **zero** grants outside `acc1.*` — none into `clt1`, `led1`, `iam2`, `cfg1`, `sec1`. Same posture as `role_clt1_runtime`.
2. **No cross-schema foreign keys.** `client_id` is a value reference to `clt1.client_profile.client_id`, validated at write time through the CLT-01 seam; precedent: `iam2.user_role.client_id`, `led1.*.client_id`. Reasons: schema-level independence of module roles; no cross-module lock coupling; CLT-01 may legitimately move to a different store. The cost — no DB guarantee the client exists — is paid by reconciliation (file 13 check R-3) and by the write-time and resolve-time CLT-01 reads.
3. **No `DELETE` grant on any table.** Lifecycle is state, never removal.
4. **Column-level `UPDATE` grants** on `master_account` / `subaccount` / `account_restriction` / `account_change_request` exclude ownership and identity columns.
5. No column anywhere holds an amount, balance, holding, price, limit value or ledger identifier (ACC-REQ-007). A schema-guard test asserts it (file 10).
6. No column is named `enabled`, `is_enabled`, `active_flag` or similar capability-style boolean (ACC-REQ-036). `is_default` is a structural marker, not a capability.
7. All timestamps `timestamptz`, suffixed `_utc`, matching CLT-01.

## 2. Tables

### 2.1 `acc1.master_account`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK default `gen_random_uuid()` | Internal; never exposed |
| master_account_id | varchar(64) NOT NULL UNIQUE | `CHECK (master_account_id ~ '^mac_[0-9a-f]{24}$')`. Immutable |
| client_id | varchar(64) NOT NULL | Legal-entity owner (CLT-01). **Immutable.** Not unique |
| display_name | varchar(128) NOT NULL | Mutable via profile update |
| description | varchar(512) | Mutable; no PII by rule (file 16) |
| status | varchar(16) NOT NULL | `CHECK IN ('active','restricted','suspended','frozen','closing','closure_sealed','closed')` |
| client_status_at_creation | varchar(16) NOT NULL | Evidence snapshot |
| client_class_at_creation | varchar(16) NOT NULL | Evidence snapshot |
| creation_change_request_id | varchar(64) NOT NULL | The approved apply that created it (ACC-REQ invariant "no account without an approved request") |
| close_change_request_id | varchar(64) | Set on `closing` |
| closure_sealed_at_utc | timestamptz | Set on `closure_sealed` (informational; **never** a control — the controls are versions/watermarks) |
| closure_barrier | boolean NOT NULL DEFAULT false | **(R2, ACC-REQ-042)** The authoritative independent barrier fact. `CHECK (closure_barrier = (status IN ('closure_sealed','closed')))`. Set true only by the `closing → closure_sealed` transition; cleared false **only** by the governed recovery transaction (`trg_acc1_closure_barrier`). Not a capability flag — a structural safety fact |
| closure_cycle | int NOT NULL DEFAULT 0 | **(R2)** Incremented on every entry into `closing` **and** on every governed abort; keys pre-seal readiness evidence, so aborted-cycle evidence can never match a later cycle |
| closure_seal_version | int NOT NULL DEFAULT 0 | **(R2)** Incremented on entering `closure_sealed`; **monotonic, never reset or decremented** (an abort leaves it, so a later seal gets a strictly higher value). `CHECK (status NOT IN ('closure_sealed','closed') OR closure_seal_version > 0)` |
| closure_sealed_at_version | int | **(R2)** The target `version` written by the seal transition (= `NEW.version`); the bound the attestation's `max_resolution_version_committed` must stay below. Set once per seal |
| opened_at_utc | timestamptz NOT NULL | |
| closed_at_utc | timestamptz | Set on `closed`; `CHECK ((status='closed') = (closed_at_utc IS NOT NULL))` |
| version | int NOT NULL DEFAULT 1 | Bumped on **every** mutation; the consumer evidence value |
| created_at_utc, updated_at_utc | timestamptz | |

Constraints / indexes:

- `UNIQUE (master_account_id, client_id)` — the target of the subaccount composite FK.
- `INDEX (client_id, status)`.
- **No** `UNIQUE (client_id)` and no partial unique on `client_id` — one-to-many capable (ACC-REQ-008). The initial one-per-client limit is application policy under an advisory lock, not schema.

### 2.2 `acc1.subaccount`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | Internal |
| subaccount_id | varchar(64) NOT NULL UNIQUE | `CHECK (~ '^sac_[0-9a-f]{24}$')`. Immutable |
| master_account_id | varchar(64) NOT NULL | Immutable |
| client_id | varchar(64) NOT NULL | Copied from the master by the DB, not the caller (§5 trigger). Immutable |
| purpose | varchar(16) NOT NULL | `CHECK IN ('general','trading','treasury','payments','rwa')`. Immutable. Label only |
| name | varchar(128) NOT NULL | Mutable via profile update |
| description | varchar(512) | |
| is_default | boolean NOT NULL DEFAULT false | Structural marker |
| status | varchar(16) NOT NULL | Same `CHECK` as master |
| creation_change_request_id | varchar(64) NOT NULL | |
| close_change_request_id | varchar(64) | |
| closure_sealed_at_utc / closure_barrier / closure_cycle / closure_seal_version / closure_sealed_at_version | | As master (same columns and `CHECK`s) |
| opened_at_utc / closed_at_utc | timestamptz | As master |
| version | int NOT NULL DEFAULT 1 | |
| created_at_utc, updated_at_utc | timestamptz | |

Constraints / indexes:

- **`FOREIGN KEY (master_account_id, client_id) REFERENCES acc1.master_account (master_account_id, client_id)`** — structural enforcement of ACC-REQ-004: a subaccount whose `client_id` differs from its master's cannot exist.
- `UNIQUE (master_account_id) WHERE is_default` — at most one default per master.
- `UNIQUE (master_account_id, lower(name)) WHERE status <> 'closed'` — name unique among non-`closed` siblings (`closing` and `closure_sealed` included; RF-02).
- **`UNIQUE (subaccount_id, master_account_id, client_id)`** — the target of the restriction composite FK (RF-06).
- `INDEX (client_id, status)`, `INDEX (master_account_id, status)`.
- The name-uniqueness index above covers every status except `closed`, so `closing` and `closure_sealed` still hold their name and count against limits (RF-02).

### 2.3 `acc1.account_restriction`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| restriction_id | varchar(64) NOT NULL UNIQUE | `rst_…` |
| target_type | varchar(16) NOT NULL | `CHECK IN ('master_account','subaccount')` |
| master_account_id | varchar(64) NOT NULL | Always set (for a subaccount target it is the parent) |
| subaccount_id | varchar(64) | `CHECK ((target_type='subaccount') = (subaccount_id IS NOT NULL))` |
| client_id | varchar(64) NOT NULL | Denormalised owner, bound **structurally** to the actual owner (see FKs below) |
| kind | varchar(24) NOT NULL | `CHECK IN ('partial_restriction','suspension','full_freeze')` |
| scopes | text[] NOT NULL | `CHECK` non-empty and `<@ ARRAY['trade_block','deposit_block','withdrawal_block','payout_destination_block','report_only_access','full_account_freeze']`; `full_freeze ⇔ scopes = {full_account_freeze}` |
| source_type | varchar(40) NOT NULL | FRZ-RULE-001 vocabulary (`CHECK IN (…)`) |
| source_ref | varchar(128) | Case / order / directive reference — reference only |
| reason_code | varchar(64) NOT NULL | Required (WF-26 §30.6) |
| status | varchar(12) NOT NULL | `CHECK IN ('scheduled','active','lifted','expired','cancelled')` |
| effective_from_utc | timestamptz NOT NULL | |
| effective_until_utc | timestamptz | `CHECK (effective_until_utc IS NULL OR source_type NOT IN ('court_order','regulatory_directive'))` — authority-sourced restrictions never lapse by time |
| applied_change_request_id | varchar(64) NOT NULL | |
| lifted_change_request_id | varchar(64) | |
| lift_evidence_ref | varchar(256) | Required when `status='lifted'` (`CHECK`) |
| lifted_at_utc | timestamptz | |
| cancelled_change_request_id | varchar(64) | **(R2-F07)** Set with `status='cancelled'` (`CHECK ((status='cancelled') = (cancelled_change_request_id IS NOT NULL))`) |
| cancel_evidence_ref | varchar(256) | Required when an authority-sourced (`court_order`/`regulatory_directive`) restriction is cancelled (`CHECK`) |
| cancelled_at_utc | timestamptz | |
| created_at_utc | timestamptz | |

**Owner binding (RF-06) — two composite foreign keys:**

1. `FOREIGN KEY (master_account_id, client_id) REFERENCES acc1.master_account (master_account_id, client_id)` — always enforced; a restriction cannot name a master under a different client.
2. `FOREIGN KEY (subaccount_id, master_account_id, client_id) REFERENCES acc1.subaccount (subaccount_id, master_account_id, client_id)` (`MATCH SIMPLE`) — enforced for subaccount targets (`subaccount_id` non-null; skipped for master targets where the first FK suffices). Together with `CHECK ((target_type='subaccount') = (subaccount_id IS NOT NULL))`, a restriction **cannot pair client A / master A with client B's subaccount**.

`INDEX (master_account_id, status)`, `INDEX (subaccount_id, status)`, `INDEX (effective_from_utc, effective_until_utc)` (time-effective resolution). Append-oriented: only `status`, `lifted_*`, `lift_evidence_ref`, `cancelled_*`, `cancel_evidence_ref` are updatable. Housekeeping updates are permitted; enforcement never depends on them (file 06 §3).

### 2.4 `acc1.account_change_request`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| change_request_id | varchar(64) NOT NULL UNIQUE | `acr_…` |
| change_type | varchar(32) NOT NULL | `CHECK IN ('create_master_account','create_subaccount','close_master_account','close_subaccount','seal_closure','abort_closure','apply_restriction','lift_restriction','cancel_scheduled_restriction')` **(R2: seal, abort, cancel added)** |
| target_master_account_id | varchar(64) | Null for `create_master_account` |
| target_subaccount_id | varchar(64) | |
| client_id | varchar(64) NOT NULL | Owner in scope of the change |
| payload | jsonb NOT NULL | The **canonical approval payload** exactly as returned to the operator for IAM-02 (`{change_request_id, change_type, client_id, target ids, parameters, requested_by}`); minimal, non-sensitive, **no PII, no free text beyond reason/evidence references** |
| payload_hash | varchar(80) NOT NULL | `@aix/foundation` `fingerprint(payload)` = `"sha256:" + 64 hex` (71 chars; column sized to hold it). Recomputed from the **stored** payload at apply; passed to IAM-02 as `current_payload_hash`. ACC-01 never submits a hash to IAM-02 approval request |
| status | varchar(12) NOT NULL | `CHECK IN ('requested','applied','cancelled','expired')` |
| requested_by | varchar(64) NOT NULL | IAM user id (maker) |
| idempotency_key | varchar(128) NOT NULL | `UNIQUE (requested_by, idempotency_key)` |
| approval_id | varchar(64) | IAM-02 approval, recorded at apply. **(R2-F04)** Today's `execute-verify` neither verifies nor returns it, so it is **caller-asserted** until the actor-binding contract exists; see `approval_id_source` |
| approval_id_source | varchar(16) | **(R2)** `CHECK IN ('caller_asserted','iam2_attested')`. `iam2_attested` only when the IAM-02 actor-binding contract (DCR-ACC-IAM-06) returned it; `caller_asserted` rows are never presented as verified evidence (R-7 reports the source) |
| authenticated_apply_actor_id | varchar(64) | **(R2)** Attested authenticated apply actor from IAM-02 (null while `caller_asserted`) |
| approver_user_id | varchar(64) | **(R2)** Attested checker identity (null while `caller_asserted`); `CHECK (approver_user_id IS NULL OR approver_user_id <> requested_by)` |
| approval_policy_id | varchar(64) | **(R2)** Attested IAM-02 policy id (null while `caller_asserted`) |
| session_principal_id | varchar(64) | **(R2)** IAM-01-authenticated session principal at apply (local defence-in-depth; audited beside `requested_by`) |
| result_ref | varchar(64) | Created/affected account or restriction id |
| environment | varchar(16) NOT NULL | Canonical environment name |
| expires_at_utc | timestamptz NOT NULL | |
| applied_at_utc | timestamptz | |
| sec_audit_ref | varchar(64) | |
| created_at_utc, updated_at_utc | timestamptz | |

`INDEX (status, expires_at_utc)`, `INDEX (target_master_account_id)`.

### 2.5 `acc1.account_status_history` (append-only)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| target_type | varchar(16) | `master_account` / `subaccount` |
| target_id | varchar(64) | `mac_…` / `sac_…` |
| client_id | varchar(64) | |
| from_status | varchar(16) | Null on creation |
| to_status | varchar(16) | |
| cause_type | varchar(28) | `change_request` / `restriction_expiry` / `restriction_activation` / `restriction_lift_inline_activation` / `restriction_cancel` / `closure_initiation` / `closure_seal` / `closure_complete` / `closure_abort` |
| cause_ref | varchar(64) | Change request or restriction id |
| version_after | int | Row `version` after the change |
| actor | varchar(64) | IAM user or `system:acc1` |
| environment | varchar(16) | |
| sec_audit_ref | varchar(64) | Populated in the same transaction; `NOT NULL` |
| occurred_at_utc | timestamptz | |

`BEFORE UPDATE OR DELETE` trigger raises — append-only regardless of grants. `INDEX (target_id, occurred_at_utc)`.

### 2.6 `acc1.closure_readiness` (pre-seal; append-only) — **(R2-F01)**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| readiness_seq | bigint identity | Monotonic; **the latest row per (target, attester, `closure_cycle_observed`) is the only one that counts** |
| target_type / target_id | | |
| attester_module | varchar(16) | `LED-01`, later `WLT-01`, … |
| closure_cycle_observed | int | Must equal the target's current `closure_cycle` to count |
| readiness_status | varchar(12) | `CHECK IN ('ready','not_ready','unavailable')` |
| balance_state | varchar(10) | `CHECK IN ('none','returned','present')` — **a state, never an amount** (ACC-REQ-007) |
| open_withdrawal_count / open_settlement_count / blocking_recon_break_count / in_flight_unaccounted_count | int | `CHECK >= 0`; all must be 0 for `ready` |
| journal_watermark | varchar(64) | W_pre: attester's opaque target-scoped journal position; compared for **equality** only |
| max_resolution_version_observed | int | Maximum ACC-01 resolution `version` observed by committed postings |
| reason_codes | text[] | |
| evidence_ref | varchar(128) | Attester's reference only |
| as_of_utc | timestamptz | Secondary freshness guard `ACC1_ATTESTATION_MAX_AGE_SECONDS` |
| created_at_utc | timestamptz | |

`CHECK (readiness_status <> 'ready' OR (balance_state <> 'present' AND open_withdrawal_count = 0 AND open_settlement_count = 0 AND blocking_recon_break_count = 0 AND in_flight_unaccounted_count = 0))`.

### 2.7 `acc1.closure_attestation` (post-barrier; append-only)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| attestation_seq | bigint identity | **(R2)** Monotonic; only the **latest** row per (target, attester, `seal_version_observed`) may satisfy completion |
| target_type / target_id | | |
| attester_module | varchar(16) | `LED-01`, later `WLT-01`, … |
| seal_version_observed | int | The `closure_seal_version` the attester observed; **must equal the target's current value to count** |
| attested_status | varchar(12) | `CHECK IN ('clear','blocked','unavailable')` |
| journal_watermark | varchar(64) | Attester's opaque watermark at attestation |
| preseal_watermark_ref | varchar(64) | **(R2)** W_pre echoed; must equal the recorded readiness `journal_watermark` |
| committed_after_preseal_watermark | int | **(R2)** `CHECK >= 0`; must be 0 to count |
| max_resolution_version_committed | int | **(R2)** Maximum resolution `version` (target level) observed by any committed posting; must be `< closure_sealed_at_version` to count |
| in_flight_count | int | `CHECK >= 0` |
| in_flight_status | varchar(20) | **(R2)** `CHECK IN ('none','refused_by_fence','unresolved')`; `unresolved` never counts |
| reason_codes | text[] | |
| evidence_ref | varchar(128) | Attester's reference only |
| as_of_utc | timestamptz | Secondary freshness guard `ACC1_ATTESTATION_MAX_AGE_SECONDS` |
| created_at_utc | timestamptz | |

Append-only (same trigger). Evidence for closure and for ACC-REQ-030. An attestation with `seal_version_observed` older than the target's current seal, or taken before the seal, never satisfies completion; a superseded (non-latest) row never satisfies it either.

### 2.8 `acc1.closure_recovery` (governed abort; append-only) — **(R2, ACC-R2-HD-03)**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| target_type / target_id | | |
| from_status | varchar(16) | `CHECK IN ('closing','closure_sealed')` |
| closure_cycle_before / closure_cycle_after | int | `after = before + 1` |
| closure_seal_version_at_abort | int | Retained on the row; never reset |
| barrier_cleared | boolean | True when `from_status = 'closure_sealed'` |
| to_status | varchar(16) | The recomputed operational projection written |
| reason_code | varchar(48) | `CHECK IN ('preseal_readiness_blocked','postseal_attestation_blocked','postseal_attestation_unavailable','closure_invariant_failed','authority_restriction_blocks_closure','attester_contract_fault')` |
| evidence_ref | varchar(128) | The blocking readiness/attestation row reference |
| change_request_id | varchar(64) NOT NULL | The applied `abort_closure` request |
| sec_audit_ref | varchar(64) NOT NULL | Critical audit |
| occurred_at_utc | timestamptz | |

Append-only (same trigger). One row per aborted target (a master abort writes one per returned row).

## 3. What is deliberately absent

| Not stored | Why |
|---|---|
| Legal name, registration number, UBO, class beyond the creation snapshot | CLT-01's; snapshot is evidence, not a copy of record |
| Members / roles / scope grants | CLT-01 membership; IAM-02 grants |
| Ledger account ids, balances, amounts, limits | LED-01; ACC-REQ-007 |
| Product / asset / capability flags | CFG-01, AST-01; ACC-REQ-021, -036 |
| Cached CLT-01 status | Stale `active` is a safety defect (blueprint §14.4) |
| A "default subaccount of client" pointer | Would make the default a fallback target (ACC-HD-1) |

## 4. Reference data

Enumerations (`purpose`, `source_type`, scopes, statuses) are `CHECK` constraints, so extending them is a migration and therefore a governed change. No mutable reference table can quietly widen the model. `EXP-01` / `RWA-*` purpose additions follow that path (OQ-08).

## 5. Triggers (all in the migration, all tested)

| Trigger | Table | Behaviour |
|---|---|---|
| `trg_acc1_ma_immutable` | `master_account` | `BEFORE UPDATE`: raise if `master_account_id`, `client_id`, `opened_at_utc`, `created_at_utc`, `creation_change_request_id` differ |
| `trg_acc1_sa_immutable` | `subaccount` | `BEFORE UPDATE`: raise if `subaccount_id`, `master_account_id`, `client_id`, `purpose`, `is_default`, creation fields differ |
| `trg_acc1_sa_owner` | `subaccount` | `BEFORE INSERT`: **read the master row with `SELECT … FOR SHARE`** (R2-F02: serialises with a concurrent master-closure apply that `FOR UPDATE`s the master, so a child cannot slip in after master closure has begun); **set** `client_id` from that row (caller-supplied value ignored, mismatch impossible); reject unless master status ∈ (`active`, `restricted`) — i.e. reject `closing`/`closure_sealed`/`closed`/`frozen`/`suspended` |
| `trg_acc1_status_transition` | both | `BEFORE UPDATE OF status`: only the legal transitions of file 06 §1.1 (7 statuses); `closed` terminal; **`closing`/`closure_sealed` → operational projection only when the session cause is `closure_abort` and the cause reference is an applied `abort_closure` request**; bumps `version`, `updated_at_utc`, and on `closing` entry and on abort increments `closure_cycle` |
| `trg_acc1_status_history` | both | `AFTER INSERT OR UPDATE OF status`: inserts the history row from session-scoped `acc1.cause_type/cause_ref/actor` settings; **raises if they are unset** — a status change with no recorded cause cannot commit |
| `trg_acc1_append_only` | `account_status_history`, `closure_readiness`, `closure_attestation`, `closure_recovery` | Raise on `UPDATE`/`DELETE` |
| `trg_acc1_restriction_terminal` | `account_restriction` | `lifted`/`expired`/`cancelled` are terminal; authority-sourced cannot be set `expired`; **`cancelled` only from `scheduled`** (R2-F07) and only with `cancelled_change_request_id`; `lifted` from `active` (housekeeping-independent: a time-effective `scheduled` row is first advanced `scheduled → active` in the **same** transaction by the governed lift) |
| `trg_acc1_default_protected` | `subaccount` | **(R2-F02 — replaces the v0.2 rule that made the default wait for its master to close.)** The default subaccount may enter `closing` **only** if its master is `closing` in the same transaction under the same closure request id (`acc1.cause_ref`); it may leave `closing`/`closure_sealed` by the ordinary child path (`closure_sealed`, `closed`) regardless of master progress, or by the governed abort **only together with** its master's recovery under the same abort request; it can never be closed or aborted alone |
| `trg_acc1_seal` | both | `closure_barrier`, `closure_seal_version`, `closure_sealed_at_version`, `closure_sealed_at_utc` are set **only** on the `closing → closure_sealed` transition (`closure_seal_version` incremented; `closure_sealed_at_version := NEW.version`; `closure_barrier := true`). A **master** may enter `closure_sealed` only if **every** child is `closed` (the default included). `closure_sealed → closed` requires, evaluated in the completing transaction: for **every configured attester** the **latest** (`max(attestation_seq)`) row at the current `closure_seal_version` is `clear`, `seal_version_observed = closure_seal_version`, `committed_after_preseal_watermark = 0`, `max_resolution_version_committed < closure_sealed_at_version`, `in_flight_status <> 'unresolved'`, `preseal_watermark_ref` equals the latest readiness `journal_watermark` for that cycle; **a `clear` row that is not the latest never satisfies it**. `closing → closure_sealed` additionally requires the **latest** `closure_readiness` row per attester at the current `closure_cycle` to be `ready` |
| `trg_acc1_closure_barrier` | both | **(R2, ACC-REQ-042)** `closure_barrier` may change `false → true` only in the seal transition and `true → false` **only** in a governed recovery (`closure_abort` cause + a `closure_recovery` row written in the same transaction); `CHECK (closure_barrier = (status IN ('closure_sealed','closed')))` keeps it consistent with status; no other statement can touch it (also excluded from every column grant except the runtime's transition path) |
| `trg_acc1_closure_family` | both | **(R2-F02)** `DEFERRABLE INITIALLY DEFERRED` **constraint trigger**, evaluated at commit: a master in `closing` has no operational child (`active`/`restricted`/`suspended`/`frozen`); a master in `closure_sealed`/`closed` has only `closed` children; a default subaccount in `closing`/`closure_sealed` has a master in `closing`/`closure_sealed`. A closure/abort apply that leaves the family inconsistent cannot commit |
| `trg_acc1_restriction_version` | `account_restriction` | `AFTER INSERT OR UPDATE OF status`: increments the target row's `version` (RF-08), so every restriction change — **including cancellation** — is consumer-visible |

## 6. Grants (illustrative)

```txt
role_acc1_runtime:
  master_account         SELECT, INSERT, UPDATE (display_name, description, status, close_change_request_id, closure_barrier, closure_cycle, closure_sealed_at_utc, closure_seal_version, closure_sealed_at_version, closed_at_utc, version, updated_at_utc)
  subaccount             SELECT, INSERT, UPDATE (name, description, status, close_change_request_id, closure_barrier, closure_cycle, closure_sealed_at_utc, closure_seal_version, closure_sealed_at_version, closed_at_utc, version, updated_at_utc)
  account_restriction    SELECT, INSERT, UPDATE (status, lifted_change_request_id, lift_evidence_ref, lifted_at_utc, cancelled_change_request_id, cancel_evidence_ref, cancelled_at_utc)
  account_change_request SELECT, INSERT, UPDATE (status, approval_id, approval_id_source, authenticated_apply_actor_id, approver_user_id, approval_policy_id, session_principal_id, result_ref, applied_at_utc, sec_audit_ref, updated_at_utc)
  account_status_history SELECT, INSERT
  closure_readiness      SELECT, INSERT
  closure_attestation    SELECT, INSERT
  closure_recovery       SELECT, INSERT
  (no DELETE anywhere; no TRUNCATE; nothing outside acc1)
```

Cross-module catalogue rows (`iam2.permission`) are inserted by an **`iam2`-scoped** migration, exactly as migrations 011/013/017/022/024/… do, because `role_acc1_runtime` has, and must keep, zero grants into `iam2.*`. That migration seeds **no** `iam2.role_permission` row (role wiring happens only through IAM-02's approved workflow).

## 7. Data rules

1. Ownership immutable from creation (blueprint §9).
2. Status changes only through legal transitions; each one writes history with a cause in the same transaction.
3. A subaccount can only be created under a master whose own status permits it; its owner is derived, never supplied.
4. Restriction rows are never deleted; a lift is a state change with evidence.
5. `version` increments on every mutation of `master_account` / `subaccount` **including every restriction change against it**; consumers store it (with `applied_restriction_ids`) as decision evidence.
5a. Stored restriction lifecycle state is housekeeping; resolution **and the legality of lift/cancel** are evaluated **by time** (file 06 §3).
5c. **(R2)** `closure_barrier` is an independent stored fact; it is never derived at read from `effective_status`, and `resolve` returns it beside the closure/seal versions (file 04 §3.1).
5d. **(R2)** Closure evidence is keyed to `closure_cycle` (readiness) and `closure_seal_version` (attestation); only the latest row per target + attester + key counts; abort bumps `closure_cycle`, never resets `closure_seal_version`.
5b. Retention: **no hard deletion of any row**; the platform/client-record retention policy applies once formally defined (DCR-ACC-GOV-06); ACC-01 defines no retention period.
6. Direct DB edits of status/owner are prohibited by grants **and** triggers; break-glass DB access is outside this module and logged per platform rules.

## 8. Migration requirements (for the future task)

- Up/down/re-up regression automation committed with the migration (WLT-01 2C-A precedent).
- Down migration must not widen `role_acc1_runtime` and must be recorded as destructive for evidence tables (`account_status_history`, `closure_readiness`, `closure_attestation`, `closure_recovery` are evidence; down is dev/test only and documented as such).
- Any new configuration (`ACC1_MAX_SUBACCOUNTS_PER_MASTER`, `ACC1_ATTESTATION_MAX_AGE_SECONDS` — applies to readiness **and** attestation as a secondary guard —, `ACC1_CHANGE_REQUEST_TTL`, and the `DEP-*` evidence declarations of file 01 §4.5) is required-with-validation, with no arbitrary default in code (ACC-HD-3). **No configuration or migration logic branches on the environment name** (ACC-REQ-035).
- Migration-head pin tests elsewhere must not be added by ACC-01 (the anti-pattern fixed twice: WLT, `clt1-db.test.ts`).
- Fail-loud canary in every DB-dependent ACC-01 test file (H-D3C-1 convention); tests are ownership-scoped, never unscoped `DELETE`/`COUNT` on shared tables (M-1, MIG-004-O1 lessons).
