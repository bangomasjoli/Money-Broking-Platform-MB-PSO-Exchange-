# ACC-01 Account Structure
## 05 Database Design (v0.4)

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
| close_change_request_id | varchar(64) | Set on `closing`: the **initiation record** id (an `account_change_request` row with `approval_mode = 'maker_only'`, ACC-R3-HD-02). Also the `closure_family_id` of a master closure |
| closure_family_id | varchar(64) | **(R3, ACC-REQ-051)** Set only when the row enters `closing` as a **member of a master-family closure** (= the master's initiation id); NULL for an independent closure. Cleared **only** by that family's governed abort. `CHECK (closure_family_id IS NULL OR status IN ('closing','closure_sealed','closed'))` |
| closure_seal_pin_id | varchar(64) | **(R3, ACC-REQ-052)** The `closure_seal_pin` written by the seal; set only by the `closing → closure_sealed` transition and cleared only by the governed abort. `CHECK ((status IN ('closure_sealed','closed')) = (closure_seal_pin_id IS NOT NULL))` |
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
| closure_sealed_at_utc / closure_barrier / closure_cycle / closure_seal_version / closure_sealed_at_version / closure_family_id / closure_seal_pin_id | | As master (same columns and `CHECK`s). **(R3)** `CHECK (NOT is_default OR status NOT IN ('closing','closure_sealed','closed') OR closure_family_id IS NOT NULL)` — the default can only ever be in a closure state as a member of its master's family |
| opened_at_utc / closed_at_utc | timestamptz | As master |
| version | int NOT NULL DEFAULT 1 | |
| created_at_utc, updated_at_utc | timestamptz | |

Constraints / indexes:

- **`FOREIGN KEY (master_account_id, client_id) REFERENCES acc1.master_account (master_account_id, client_id)`** — structural enforcement of ACC-REQ-004: a subaccount whose `client_id` differs from its master's cannot exist.
- `UNIQUE (master_account_id) WHERE is_default` — at most one default per master. It is deliberately **not** status-filtered: with ACC-R3-HD-01 the default is never `closed` while its master is non-`closed`, so "restore a default" never arises and no second default can ever be inserted (R3-F01). The structural invariant (ACC-REQ-050) is enforced by the deferred `trg_acc1_master_default_invariant` (§5).
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
| approval_mode | varchar(12) NOT NULL | **(R3, ACC-R3-HD-02)** `CHECK IN ('maker_checker','maker_only')` and `CHECK ((approval_mode = 'maker_only') = (change_type IN ('close_master_account','close_subaccount')))`. `maker_only` rows are closure **initiations**: written and `applied` in one transaction by the initiate route; `approval_id`, `approver_user_id`, `approval_policy_id` are NULL and `entitlement_evidence_ref` is NOT NULL |
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
| actor_assertion_authority | varchar(64) | **(R3, R3-F04)** The authority IAM-02 reports it verified the actor against (e.g. the IAM-01 session authority); NOT NULL when `approval_id_source = 'iam2_attested'` or `approval_mode = 'maker_only'`. Never a value ACC-01 produced |
| entitlement_evidence_ref | varchar(128) | **(R3, R3-F03)** Reference to the IAM-02 attested entitlement evaluation (maker / checker / initiator; grant and policy references). NOT NULL for every applied row whose `approval_id_source = 'iam2_attested'` and for every `maker_only` row |
| attested_credential_scope | varchar(64) | **(R3)** The scope of the IAM-02 credential ACC-01 presented, as IAM-02 stated it (must be a narrow scope to have been accepted) |
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
| cause_type | varchar(28) | `change_request` / `restriction_expiry` / `restriction_activation` / `restriction_lift_inline_activation` / `restriction_cancel` / `closure_initiation` / `closure_seal` / `closure_complete` / `closure_family_complete` **(R3)** / `closure_abort` |
| cause_ref | varchar(64) | Change request or restriction id |
| version_after | int | Row `version` after the change |
| actor | varchar(64) | IAM user or `system:acc1` |
| environment | varchar(16) | |
| sec_audit_ref | varchar(64) | Populated in the same transaction; `NOT NULL` |
| occurred_at_utc | timestamptz | |

`BEFORE UPDATE OR DELETE` trigger raises — append-only regardless of grants. `INDEX (target_id, occurred_at_utc)`.

### 2.6 `acc1.closure_readiness` (pre-seal; append-only) — **(R2-F01; R3-F02)**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| readiness_id | varchar(64) NOT NULL UNIQUE | **(R3)** Immutable public evidence id, `crd_` + 24 lowercase hex; what the seal request and the seal pin reference |
| readiness_seq | bigint identity | Monotonic; **the latest row per (target, attester, `closure_cycle_observed`) is the only one that counts until the seal**; from the seal on the **pin** is the reference |
| target_type / target_id | | |
| attester_module | varchar(16) | `LED-01`, later `WLT-01`, … |
| closure_cycle_observed | int | Must equal the target's current `closure_cycle` **at insert** (`trg_acc1_readiness_insert`) |
| closure_change_request_id | varchar(64) NOT NULL | **(R3)** The closure initiation this row belongs to; must equal the target's `close_change_request_id` at insert |
| closure_family_id | varchar(64) | **(R3)** Copied by the trigger from the target; NULL for an independent closure |
| target_version_observed | int NOT NULL | **(R3)** Set by the trigger from the locked target row (**never caller-supplied**); the seal compares the approved `version` to the target, this records what was observed |
| readiness_status | varchar(12) | `CHECK IN ('ready','not_ready','unavailable')` |
| balance_state | varchar(10) | `CHECK IN ('none','returned','present')` — **a state, never an amount** (ACC-REQ-007) |
| open_withdrawal_count / open_settlement_count / blocking_recon_break_count / in_flight_unaccounted_count | int | `CHECK >= 0`; all must be 0 for `ready` |
| journal_watermark | varchar(64) | W_pre: the attester's opaque target-scoped journal position, **which the DCR requires to be commit-ordered** (R3-F02.5); compared for **equality** only |
| max_resolution_version_observed | int | Maximum ACC-01 resolution `version` observed by committed postings |
| readiness_payload_hash | varchar(80) NOT NULL | **(R3)** `fingerprint` of the canonical readiness payload (status, counts, balance state, watermark, versions, cycle, attester, contract ref); bound into the approval payload and the pin |
| attester_contract_ref | varchar(128) NOT NULL | **(R3)** The contract descriptor reference the attester stated when this row was collected (`DEP-LED-CLOSURE-CONTRACT`) |
| reason_codes | text[] | |
| evidence_ref | varchar(128) | Attester's reference only |
| as_of_utc | timestamptz | Secondary freshness guard `ACC1_ATTESTATION_MAX_AGE_SECONDS` |
| created_at_utc | timestamptz | |

`CHECK (readiness_status <> 'ready' OR (balance_state <> 'present' AND open_withdrawal_count = 0 AND open_settlement_count = 0 AND blocking_recon_break_count = 0 AND in_flight_unaccounted_count = 0))`.

**Insert legality (`trg_acc1_readiness_insert`, R3-F02).** `BEFORE INSERT`: lock the target row `FOR SHARE` (master row first for a subaccount); raise unless the target `status = 'closing'`, `closure_cycle = NEW.closure_cycle_observed` and `close_change_request_id = NEW.closure_change_request_id`; set `target_version_observed` and `closure_family_id` from the locked row. Consequences: no readiness row can be inserted after the seal, after an abort (cycle changed) or for another initiation, and a readiness collection racing a seal apply serialises on the target row.

### 2.7 `acc1.closure_attestation` (post-barrier; append-only)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| attestation_seq | bigint identity | **(R2)** Monotonic; only the **latest** row per (target, attester, `seal_version_observed`) may satisfy completion |
| target_type / target_id | | |
| attester_module | varchar(16) | `LED-01`, later `WLT-01`, … |
| seal_version_observed | int | The `closure_seal_version` the attester observed; **must equal the target's current value to count** |
| seal_pin_id | varchar(64) | **(R3)** Set by `trg_acc1_attestation_bind` from the target's `closure_seal_pin_id` (never caller-supplied) |
| pinned_readiness_id | varchar(64) | **(R3)** Set by the trigger from the pin's pinned readiness for this attester |
| closure_cycle_observed | int | **(R3)** Set by the trigger from the target's `closure_cycle` |
| attested_status | varchar(12) | `CHECK IN ('clear','blocked','unavailable')` |
| journal_watermark | varchar(64) | Attester's opaque commit-ordered watermark at attestation |
| preseal_watermark_ref | varchar(64) | **(R2)** W_pre echoed; **must equal the pin's pinned-readiness `journal_watermark`** (R3) |
| committed_after_preseal_watermark | int | **(R2)** `CHECK >= 0`; must be 0 to count |
| max_resolution_version_committed | int | **(R2)** Maximum resolution `version` (target level) observed by any committed posting; must be `< closure_sealed_at_version` to count |
| in_flight_count | int | `CHECK >= 0` |
| in_flight_status | varchar(20) | **(R2)** `CHECK IN ('none','refused_by_fence','unresolved')`; `unresolved` never counts |
| balance_state | varchar(10) | **(R3, defence in depth)** `CHECK IN ('none','returned','present')`; must be `none`/`returned` to count |
| open_item_count | int | **(R3)** `CHECK >= 0`; must be 0 to count |
| binding_ok | boolean NOT NULL | **(R3)** Computed **by the trigger**, not the caller: `seal_version_observed = target.closure_seal_version AND preseal_watermark_ref = pin watermark AND closure_cycle_observed = target.closure_cycle` |
| attester_contract_ref | varchar(128) NOT NULL | **(R3)** The descriptor reference stated by the attester at collection |
| reason_codes | text[] | |
| evidence_ref | varchar(128) | Attester's reference only |
| as_of_utc | timestamptz | Secondary freshness guard `ACC1_ATTESTATION_MAX_AGE_SECONDS` |
| created_at_utc | timestamptz | |

Append-only (same trigger). Evidence for closure and for ACC-REQ-030. An attestation with `seal_version_observed` older than the target's current seal, one with `binding_ok = false`, one taken before the seal, or a superseded (non-latest) row never satisfies completion. A row that does not bind is still **recorded** (as evidence of what the attester said), it simply never counts.

### 2.8 `acc1.closure_recovery` (governed abort; append-only) — **(R2, ACC-R2-HD-03)**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| target_type / target_id | | |
| from_status | varchar(16) | `CHECK IN ('closing','closure_sealed')` |
| closure_cycle_before / closure_cycle_after | int | `after = before + 1` |
| closure_seal_version_at_abort | int | Retained on the row; never reset |
| closure_family_id | varchar(64) | **(R3)** The family whose abort returned this row; NULL for an independent target's own abort |
| family_role | varchar(24) | **(R3)** `CHECK IN ('master','default','master_directed_child','independent_own_abort')` |
| barrier_cleared | boolean | True when `from_status = 'closure_sealed'` |
| to_status | varchar(16) | The recomputed operational projection written |
| reason_code | varchar(48) | `CHECK IN ('preseal_readiness_blocked','postseal_attestation_blocked','postseal_attestation_unavailable','closure_invariant_failed','authority_restriction_blocks_closure','attester_contract_fault')` |
| evidence_ref | varchar(128) | The blocking readiness/attestation row reference. **(R3)** For a master abort it may name a row belonging to the master, the default or a master-directed child of the family (`evidence_owner_target_id`); never an independent child or a non-member |
| evidence_owner_target_id | varchar(64) | **(R3)** The family member that owns the cited evidence |
| change_request_id | varchar(64) NOT NULL | The applied `abort_closure` request |
| sec_audit_ref | varchar(64) NOT NULL | Critical audit |
| occurred_at_utc | timestamptz | |

Append-only (same trigger). One row per aborted target (a master abort writes one per returned row: the master, the default and every master-directed child). **Independent closures preserved by a master abort get no row.**

### 2.9 `acc1.closure_seal_pin` and `acc1.closure_seal_pin_readiness` (append-only) — **(R3, R3-F02, ACC-REQ-052)**

One `closure_seal_pin` row per (target, `closure_seal_version`), written **in the seal transaction**; it is the persisted sealed binding that completion and the attestation compare against.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| seal_pin_id | varchar(64) NOT NULL UNIQUE | `csp_` + 24 lowercase hex; what `closure_seal_pin_id` on the target references |
| target_type / target_id | | |
| closure_seal_version | int NOT NULL | `UNIQUE (target_id, closure_seal_version)` |
| closure_sealed_at_version | int NOT NULL | The target `version` written by the seal |
| closure_cycle | int NOT NULL | The cycle the approved readiness belongs to |
| target_version_approved | int NOT NULL | The target `version` the checker approved; must have equalled the live version at seal |
| closure_change_request_id | varchar(64) NOT NULL | The initiation |
| closure_family_id | varchar(64) | Family the target sealed in (NULL = independent) |
| family_set_hash | varchar(80) | **Master only:** the approved and re-verified set hash (§2.10); NULL for others |
| seal_change_request_id | varchar(64) NOT NULL | The applied `seal_closure` request |
| seal_payload_hash | varchar(80) NOT NULL | The seal request payload hash |
| approval_id / approver_user_id / approval_policy_id | varchar(64) NOT NULL | The attested final checker approval (`iam2_attested` only) |
| apply_verified_watermark | varchar(64) NOT NULL | Result of the apply-time fresh verification (must equal the pinned watermark); **not** a readiness row |
| apply_verified_as_of_utc | timestamptz NOT NULL | |
| sealed_at_utc | timestamptz NOT NULL | |

`closure_seal_pin_readiness`: `(seal_pin_id, attester_module)` primary key; `readiness_id` **FK → `closure_readiness.readiness_id`**, `readiness_seq`, `journal_watermark`, `readiness_payload_hash` (copied at seal, so the pin is self-contained). Both tables are append-only (`trg_acc1_append_only`); the pin is **never edited**, an abort leaves it as evidence and clears only the target's `closure_seal_pin_id`, and a later seal writes a **new** pin at a strictly higher `closure_seal_version`.

### 2.10 `acc1.closure_family` and `acc1.closure_family_member` — **(R3, R3-F01, ACC-REQ-051)**

`closure_family` — one row per master closure:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| closure_family_id | varchar(64) NOT NULL UNIQUE | = the master's initiation record id (`acr_…`) |
| master_account_id / client_id | varchar(64) NOT NULL | Composite FK to the master (`master_account_id`, `client_id`) |
| family_status | varchar(10) NOT NULL | `CHECK IN ('open','completed','aborted')`; the only updatable column with its reference (`open → completed` only by family completion; `open → aborted` only by the governed abort; terminal) |
| set_hash_at_initiation | varchar(80) NOT NULL | The `family_set_hash` the maker saw and the apply re-derived |
| completed_at_utc / completion_ref / aborted_at_utc / abort_change_request_id | | Set with the terminal status (`CHECK` pairs) |
| created_at_utc | timestamptz | |

`closure_family_member` — **immutable** (append-only) one row per participant, written in the initiation transaction:

| Column | Type | Notes |
|---|---|---|
| closure_family_id | varchar(64) NOT NULL | FK → `closure_family` |
| target_type / target_id | | `UNIQUE (closure_family_id, target_id)` |
| membership | varchar(24) NOT NULL | `CHECK IN ('master','default','master_directed_child','independent_preserved')`; exactly one `master` and exactly one `default` per family (deferred check) |
| status_at_initiation | varchar(16) NOT NULL | |
| closure_cycle_at_initiation | int NOT NULL | |
| independent_initiation_id | varchar(64) | **The child's own initiation id** — required iff `membership = 'independent_preserved'`; this is how independently initiated closures are **identified and preserved** |

The **`family_set_hash`** is `fingerprint` over the ascending-id list of master-directed members' `(target_id, membership, closure_cycle, closure_seal_version, closure_sealed_at_version, pinned readiness ids, latest attestation ids)`; at initiation it covers `(target_id, membership, version, status)`. It never includes a mutable `version` after seal, so a restriction recorded against a sealed member does not itself invalidate the family (an authority restriction blocks completion by its own rule).

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
| `trg_acc1_status_transition` | both | `BEFORE UPDATE OF status`: only the legal transitions of file 06 §1.1 (7 statuses); `closed` terminal; **`closing`/`closure_sealed` → operational projection only when the session cause is `closure_abort` and the cause reference is an applied `abort_closure` request**; **(R3) `closure_sealed → closed` only with cause `closure_complete` (independent target) or `closure_family_complete` (family member, in the same transaction as its master)**; bumps `version`, `updated_at_utc`, and on `closing` entry and on abort increments `closure_cycle` |
| `trg_acc1_status_history` | both | `AFTER INSERT OR UPDATE OF status`: inserts the history row from session-scoped `acc1.cause_type/cause_ref/actor` settings; **raises if they are unset** — a status change with no recorded cause cannot commit |
| `trg_acc1_append_only` | `account_status_history`, `closure_readiness`, `closure_attestation`, `closure_recovery`, **`closure_seal_pin`, `closure_seal_pin_readiness`, `closure_family_member` (R3)** | Raise on `UPDATE`/`DELETE` |
| `trg_acc1_restriction_terminal` | `account_restriction` | `lifted`/`expired`/`cancelled` are terminal; authority-sourced cannot be set `expired`; **`cancelled` only from `scheduled`** (R2-F07), only with `cancelled_change_request_id` **and only while `effective_from_utc > clock_timestamp()` — evaluated at the statement (row-locked) and re-evaluated by a deferred constraint check at commit (R3-F07.2)**; `lifted` from `active` (housekeeping-independent: a time-effective `scheduled` row is first advanced `scheduled → active` in the **same** transaction by the governed lift) |
| `trg_acc1_default_protected` | `subaccount` | **(R3, ACC-R3-HD-01 — replaces the v0.3 rule)** The default subaccount may enter `closing` **only** if its master enters `closing` in the same transaction under the same `closure_family_id`; it may enter `closure_sealed` by the ordinary child seal (its own pin) while its master is `closing`; it may become `closed` **only in the same transaction as its master's `closure_sealed → closed`** with cause `closure_family_complete`; it may leave `closing`/`closure_sealed` to the operational projection **only together with its master** in the same family abort. It can **never** be closed, completed or aborted alone, and never independently while the master is non-`closed` |
| `trg_acc1_seal` | both | `closure_barrier`, `closure_seal_version`, `closure_sealed_at_version`, `closure_sealed_at_utc`, `closure_seal_pin_id` are set **only** on the `closing → closure_sealed` transition (`closure_seal_version` incremented; `closure_sealed_at_version := NEW.version`; `closure_barrier := true`). **`closing → closure_sealed` requires, evaluated in the sealing transaction (R3-F02):** a `closure_seal_pin` written in the same transaction whose `target_version_approved` equals `OLD.version`, whose `closure_cycle` equals the target's, and for **each configured attester** a pin-readiness row referencing a readiness row that is **the latest `readiness_seq` for that target + attester + cycle**, is `ready`, and whose watermark and payload hash equal the pin's; for a **master**, additionally: every master-directed member `closure_sealed` with the barrier, an intact pin and a latest `clear` `binding_ok` attestation per attester at its current seal version (freshness against `ACC1_ATTESTATION_MAX_AGE_SECONDS` is a secondary guard that the **application** checks in the same locked transaction, because that setting is configuration, not database state), every `independent_preserved` member `closed`, and `family_set_hash` equal to the recomputed set hash. **`closure_sealed → closed` requires, evaluated in the completing transaction:** for **every configured attester** the **latest** (`max(attestation_seq)`) row at the current `closure_seal_version` is `clear`, `binding_ok`, `seal_version_observed = closure_seal_version`, `preseal_watermark_ref` equal to **the pin's pinned-readiness watermark (never the latest readiness)**, `committed_after_preseal_watermark = 0`, `max_resolution_version_committed < closure_sealed_at_version`, `in_flight_status <> 'unresolved'`, `balance_state <> 'present'`, `open_item_count = 0`; **a `clear` row that is not the latest never satisfies it**. A family member may reach `closed` only inside its master's completion |
| `trg_acc1_readiness_insert` | `closure_readiness` | **(R3-F02)** As §2.6: target locked `FOR SHARE`, must be `closing` at the named cycle and initiation; stamps `target_version_observed` and `closure_family_id`. **A readiness row can never be inserted after the seal** |
| `trg_acc1_attestation_bind` | `closure_attestation` | **(R3)** `BEFORE INSERT`: target locked `FOR SHARE`; must be `closure_sealed`; sets `seal_pin_id`, `pinned_readiness_id`, `closure_cycle_observed` from the target/pin and computes `binding_ok` (§2.7). The caller cannot supply or override them |
| `trg_acc1_closure_barrier` | both | **(R2, ACC-REQ-042)** `closure_barrier` may change `false → true` only in the seal transaction and `true → false` **only** in a governed recovery (`closure_abort` cause + a `closure_recovery` row written in the same transaction); `closure_seal_pin_id` and `closure_family_id` follow the same rule (set at seal / at entry to `closing`; cleared only by the governed recovery); `CHECK (closure_barrier = (status IN ('closure_sealed','closed')))` keeps it consistent with status; no other statement can touch them (also excluded from every column grant except the runtime's transition path) |
| `trg_acc1_closure_family` | both | **(R3 — rewritten)** `DEFERRABLE INITIALLY DEFERRED` **constraint trigger**, evaluated at commit: a master in `closing` has no operational child; a master in `closure_sealed` has only `closure_sealed` **master-directed** children (barrier true) or `closed` **independent** children; a master in `closed` has only `closed` children **and** every one of them reached `closed` in the same transaction if it was a family member; a default subaccount in `closing`/`closure_sealed`/`closed` has a `closure_family_id` equal to its master's and a master in `closing`/`closure_sealed`/`closed`; a `closure_family` row is `completed` iff its master is `closed`. A closure/abort/completion apply that leaves the family inconsistent cannot commit |
| `trg_acc1_master_default_invariant` | both | **(R3-F01, ACC-REQ-050)** `DEFERRABLE INITIALLY DEFERRED` **constraint trigger** on every insert/update of `master_account` or `subaccount`, evaluated at commit: **for every master with `status <> 'closed'`, exactly one subaccount has `is_default` and `status <> 'closed'`**; for every master with `status = 'closed'`, no subaccount is non-`closed`. Deferral lets the master and its default be created (and closed) in one transaction in either order. A commit that would leave a non-`closed` master without a non-`closed` default is impossible |
| `trg_acc1_family_membership` | `closure_family`, `closure_family_member` | **(R3)** Exactly one `master` and one `default` member per family; `independent_preserved` requires `independent_initiation_id` and a target that is `closing`/`closure_sealed` with `closure_family_id IS NULL` at initiation; `family_status` moves `open → completed`/`aborted` only with the matching cause reference |
| `trg_acc1_restriction_version` | `account_restriction` | `AFTER INSERT OR UPDATE OF status`: increments the target row's `version` (RF-08), so every restriction change — **including cancellation** — is consumer-visible |

## 6. Grants (illustrative)

```txt
role_acc1_runtime:
  master_account         SELECT, INSERT, UPDATE (display_name, description, status, close_change_request_id, closure_family_id, closure_seal_pin_id, closure_barrier, closure_cycle, closure_sealed_at_utc, closure_seal_version, closure_sealed_at_version, closed_at_utc, version, updated_at_utc)
  subaccount             SELECT, INSERT, UPDATE (name, description, status, close_change_request_id, closure_family_id, closure_seal_pin_id, closure_barrier, closure_cycle, closure_sealed_at_utc, closure_seal_version, closure_sealed_at_version, closed_at_utc, version, updated_at_utc)
  account_restriction    SELECT, INSERT, UPDATE (status, lifted_change_request_id, lift_evidence_ref, lifted_at_utc, cancelled_change_request_id, cancel_evidence_ref, cancelled_at_utc)
  account_change_request SELECT, INSERT, UPDATE (status, approval_id, approval_id_source, authenticated_apply_actor_id, approver_user_id, approval_policy_id, session_principal_id, actor_assertion_authority, entitlement_evidence_ref, attested_credential_scope, result_ref, applied_at_utc, sec_audit_ref, updated_at_utc)
  account_status_history SELECT, INSERT
  closure_readiness      SELECT, INSERT
  closure_attestation    SELECT, INSERT
  closure_recovery       SELECT, INSERT
  closure_seal_pin, closure_seal_pin_readiness, closure_family_member   SELECT, INSERT   (R3)
  closure_family         SELECT, INSERT, UPDATE (family_status, completed_at_utc, completion_ref, aborted_at_utc, abort_change_request_id)   (R3)
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
5e. **(R3)** From the seal on, the reference for completion and attestation is the immutable **seal pin**, never "the latest readiness"; a readiness row cannot be inserted once the target has left `closing`.
5f. **(R3)** A `closed` default under a non-`closed` master is unrepresentable (`trg_acc1_master_default_invariant`); a master-directed subaccount reaches `closed` only inside its master's completion transaction.
5g. **(R3, R3-F07.2)** Every time-effective evaluation (restriction in force, lift/cancel legality, projection recompute at abort) uses the **database `clock_timestamp()`** evaluated in the statement or locked check — never the application clock, never `now()` (transaction start).
5h. **(R3)** Lock order for every operation touching a master or its children: master row first (`FOR SHARE` for child-level work, `FOR UPDATE` for master/family work), then children in ascending internal id.
5b. Retention: **no hard deletion of any row**; the platform/client-record retention policy applies once formally defined (DCR-ACC-GOV-06); ACC-01 defines no retention period.
6. Direct DB edits of status/owner are prohibited by grants **and** triggers; break-glass DB access is outside this module and logged per platform rules.

## 8. Migration requirements (for the future task)

- Up/down/re-up regression automation committed with the migration (WLT-01 2C-A precedent).
- Down migration must not widen `role_acc1_runtime` and must be recorded as destructive for evidence tables (`account_status_history`, `closure_readiness`, `closure_attestation`, `closure_recovery`, `closure_seal_pin`, `closure_seal_pin_readiness`, `closure_family`, `closure_family_member` are evidence; down is dev/test only and documented as such).
- Any new configuration (`ACC1_MAX_SUBACCOUNTS_PER_MASTER`, `ACC1_ATTESTATION_MAX_AGE_SECONDS` — applies to readiness **and** attestation as a secondary guard —, `ACC1_CHANGE_REQUEST_TTL`, and the peer **base URLs and dedicated credential values** of file 01 §4.5) is required-with-validation, with no arbitrary default in code (ACC-HD-3). **(R3)** There is **no configuration key that declares a dependency satisfied** (no `*_GOVERNANCE_REF`, no `*_CONTRACT_VERSION` used as evidence): configuration says where to ask, never what the answer is (ACC-REQ-053). **No configuration or migration logic branches on the environment name** (ACC-REQ-035).
- Migration-head pin tests elsewhere must not be added by ACC-01 (the anti-pattern fixed twice: WLT, `clt1-db.test.ts`).
- Fail-loud canary in every DB-dependent ACC-01 test file (H-D3C-1 convention); tests are ownership-scoped, never unscoped `DELETE`/`COUNT` on shared tables (M-1, MIG-004-O1 lessons).
