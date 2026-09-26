# ACC-01 Account Structure
## 15 Regulatory Mapping (v0.4)

**Method.** This mapping cites only **internal governance sources that already exist in the repository**. It does not cite, quote or paraphrase any external regulation that this repository does not already state, and it asserts no regulatory conclusion. Where the repository records an unresolved regulatory question, it is carried as unresolved. Nothing here is legal advice, and nothing here approves any regulated activity (`DEC-013` approves none; neither does ACC-01).

## 1. Internal-rule mapping

| Source | Requirement | ACC-01 treatment |
|---|---|---|
| `DEC-011`; Doc 00 §2C rule 1 | Legal entity owns the regulatory client relationship; never a ledger account; never carries balances | ACC-01 stores no balances; owner is a reference to CLT-01 (ACC-REQ-003, -007) |
| Doc 00 §2C rule 2 | Subaccounts are not legal clients; inherit legal ownership | ACC-REQ-004/005; structural composite FK |
| Doc 00 §2C rule 3; DEC-011 #14 | One master account initially; must not assume never one-to-many | Schema one-to-many capable; limit is configuration (ACC-REQ-008) |
| Doc 00 §2C rule 4; DEC-011 rule 4 | No second membership system | ACC-01 consumes CLT-01 membership only |
| Doc 00 §21 condition 9 | Account / subaccount status active is a production-gate conjunct | `resolve` supplies it; CFG-01 evaluates (ACC-REQ-021/027) |
| Doc 00 §21A rules 3, 7; DEC-013 clauses 2–3; DEC-014 | Permission/status never activates; environments identical; fail closed | Blueprint §12; ACC-REQ-021/035/036 |
| Doc 00 §10.2A (retail lock, as stated in Doc 00) | Retail onboarding disabled by default | Class/status check at creation (ACC-REQ-013) is a **local structural backstop only** — **not** an eligibility authority; it does not replace CLT-01, KYC-01, IAM-02, CFG-01 or AST-01 (RF-11). Any retail change is decided in those owners (§10.2A rule 6) |
| Module Index §19 rules 1, 6, 9, 10, 11, 12 | No money movement without ledger; no duplicate identity; audit; maker-checker; permission ≠ activation; controls identical across environments | Blueprint §2, §12; files 07, 08 |
| Role Matrix §3.4, §3.6, §3.7, §3.8, §5.1, §5.2A, §7, §23 | No self-approval; sensitive-read logging; permission ≠ activation; environment parity; scoped roles; account freeze/unfreeze and client closure maker-checker | File 07 |
| System Rules `FRZ-RULE-001/002` | Freeze/suspension triggers and scopes | Restriction `source_type` and scope vocabularies (file 06 §2.2, §3), scopes **explanatory** under the consumer rule; `login_block` excluded as principal-level. **Ownership of whole-client freeze and `login_block`, and the relation of a CLT-01 client freeze to an ACC-01 restriction, are ungoverned (DCR-ACC-GOV-05); ACC-01 does not decide them** |
| System Rules `OFF-RULE-001` (items 1–8) | Closure cannot complete with balance, open trade/settlement/withdrawal, recon break, AML/STR restriction, unverified return destination, unapplied retention | Items 1–5: cleared during **drain** by the closure-drain allow-list (balance return to a verified own-name destination; open withdrawal/settlement completion; reconciliation break resolution — file 01 §7.1), proven by **pre-seal readiness** before the seal and by the **post-barrier** attestation after it (preventive sequence, file 02 §7); 6–8 remain client-level (CLT-01/compliance); ACC-01 also refuses seal/completion under an active authority restriction |
| Workflow Map WF-26, WF-27, §33A.3 step 4 | Freeze workflow states; closure (steps 5 balance return during closure; steps 9–10 maker prepares / checker approves after obligations are cleared); merchant account/subaccount created by ACC-01 | Files 02, 06. **(R2)** The **checker's final human approval is given immediately before the seal**, after drain and pre-seal readiness (ACC-R2-HD-02); the post-seal steps are machine-verified. v0.2's claim that one early approval covers the whole sequence is withdrawn. **(R3)** WF-27 step 1 (the plain request) is implemented as a **maker-only, entitlement-checked, audited initiation** (ACC-R3-HD-02); the single maker/checker pair remains at steps 9–10 immediately before the seal, and the approval is bound to the exact readiness evidence. For a master, the closure completes as one atomic family |
| System Rules §26 | Master error codes `CLIENT_FROZEN`, `ACCOUNT_FROZEN`, `CLIENT_SUSPENDED` | File 09 §3 |
| SRS `PAY-SRS-002`, `RWA-SRS-024` | Merchant/issuer structure scoped through IAM-02 and ACC-01; RWA consumes the account hierarchy | Purposes `payments`, `rwa`; no second identity |

## 2. Unresolved regulatory questions carried (not answered here)

| ID | Question | Where it bites | Gate |
|---|---|---|---|
| `A2-Q1` (Doc 00 §23) | Are institutional subaccounts subject to distinct KYC, reporting or safeguarding treatment? | Subaccount operating rules | Before subaccounts carry client money (file 14 §3) |
| `A2-Q2` (Doc 00 §23) | Does subaccount segregation affect client-money safeguarding obligations? | Any subaccount holding client money; how `led1` safeguarding positions relate to subaccounts | Same |

Neither blocks the architecture or the build (`DEC-011`, `DEC-013` clause 4).

## 3. Records and retention

**Approved decision:** no hard deletion; ACC-01 uses the **platform/client-record retention policy once it is formally defined** and **must not invent its own conflicting retention period**; until then it retains everything. The repository states a ≥ 6-year retention for order/execution records (`DEC-012` clause 1 rule 7; Module Index `OMS-01`) and leaves client retention class *to be defined* (CLT-01 `retention_period_by_class = to_be_defined`); **no retention period for account-structure records is stated anywhere**, so none is asserted (DCR-ACC-GOV-06 records the dependency on the platform policy).

## 4. Data protection

Account rows carry an entity reference and free-text display names. Display names of corporate accounts are usually non-personal, but the field is free text; rule: **no personal data in `display_name`/`description`** (enforced by guidance, a length cap, and a review note in the operator runbook; not technically detectable). PII questions for the entity itself remain CLT-01's (DSAR/erasure reconciled with immutable audit by pseudonymisation, CLT-01 §5.18).
