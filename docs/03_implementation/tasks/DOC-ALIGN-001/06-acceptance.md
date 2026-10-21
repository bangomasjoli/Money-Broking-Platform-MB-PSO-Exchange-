# 06 Acceptance — DOC-ALIGN-001

> This is the human acceptance record. It is distinct from the review (`04-review.md`) and the independent review it reports, which recommended acceptance but accepted nothing.

- **Final decision:** **ACCEPTED** — joint promotion of ARC-00 `00_Licence_Scope_And_Feature_Lock` v1.6 and ARC-01 `01_Project_Charter` v1.6
- **Human owner decision:** **APPROVED**
- **Date:** **2026-10-22** (Asia/Kuching)
- **Accepted by (human):** the project owner, by explicit instruction in the `DOC-ALIGN-001` working session ("OWNER-APPROVED PROMOTION")
- **Accepted commit:** the documentation-only commit that carries this file, identified through repository history (`git log` — subject "docs(control): promote Doc 00 and Charter v1.6 (DOC-ALIGN-001)"). A commit cannot name its own SHA. **Verified source baseline:** `f366403a9a9d45d3425d7b41dd2fda94cd13e956` (merge of PR #2, `PROJECT-MANDATE-001`). A later metadata checkpoint may record the resulting SHA
- **Independent review:** **ACCEPT** — an independent GPT review of the complete v1.5→v1.6 unified diffs, **as reported to this working session. No separately signed review artefact, transcript or reviewer execution ID is held in this repository, and none is claimed.** The drafting model was Claude Sonnet 5.5 (draft, two correction rounds, promotion preparation), which is not independent review
- **Acceptance evidence:** [`04-review.md`](04-review.md); [`01-delta-and-verification.md`](01-delta-and-verification.md); [`docs/01_masters/reviews/00-01_v1.5_to_v1.6_Delta_Note.md`](../../../01_masters/reviews/00-01_v1.5_to_v1.6_Delta_Note.md); the register rows ARC-00 / ARC-01 in `docs/DOCUMENT_REGISTER.md`

## Scope accepted
- **Nature:** documentation-only promotion. The owner accepted the documentation corrections and the **joint** promotion of the two masters to v1.6 (neither is authoritative alone), with `DOCUMENT_REGISTER.md` and navigation pointers updated, and v1.5 of each archived byte-identically at `docs/90_archive/masters/` (originals removed from `docs/01_masters/`).
- **Substance:** wording alignment only — software ownership separate from the recorded reference licence position; Money Broking boundary wording separated from the build-authorised, production-gated securities Exchange; "where currently prohibited" qualifications reproduced exactly; five canonical environments and stale-reference corrections in the Charter; a Charter §16.4 sign-off status note. No licence restriction, permanent prohibition, seeded identifier, runtime guard, migration or architecture decision changed.

## What this acceptance is NOT
- **It is not the six functional-role signatures required by Charter §16.4** (Project Sponsor, Compliance Officer / MLRO, Principal Officer, Technical Lead, Operations Lead, Finance Lead). **No compliance, finance, technical, operational or regulatory sign-off has occurred, been recorded or been invented.** §16.4 and §16.5 are unchanged, and every stage-specific sign-off obligation (including the compliance / MLRO go-live sign-off, Charter §24, §26.5, §29) remains outstanding.
- **It authorises no production operation, regulated activity, implementation, push, PR or merge.** It claims no regulatory approval.
- **It does not synchronise v1.6 into CFG-01.** `computeDoc00BaselineHash()` hashes `DOC00_SOURCE_VERSION`, `DOC00_LICENCE_PROFILES` and `DOC00_PROHIBITED_FEATURES`, not the Markdown; none changed — no source change, registry change, migration or reseal.

## Existing decisions and states preserved (unchanged, still open where stated)
`DEC-011`–`DEC-014` unchanged · `STATE-006` APPROVED (2026-10-21) · `DEC-015` **NOT_ACCEPTED** · `R6-Q1` **OPEN** · `D-1` **OPEN** · `D-2` **OPEN** · `MIG-001` **NOT AUTHORISED** · `MIG-008` **NOT AUTHORISED** · `assertNoExchangeRuntime` ACTIVE · MB Spot internal matching, crossing, principal dealing and proprietary market making **PROHIBITED** (permanent, every environment) · `EXO-01` securities Exchange build **AUTHORISED** · securities production activation **GATED**.

## Carry-forward (no finding raised)
- Charter §16.4 six-role sign-offs and any §16.5 formal approvals — outstanding, as above.
- `STATE-006` is not edited by this task. Its owner-decision table (`D-3`, the controlled clarification of Doc 00 §8.1 items 5, 10, 13 and §12.1 items 1–2) is delivered in substance by Doc 00 v1.6; recording `D-3` as closed is left to the owner's own decision record.
- `MIG-005` carry-forward `G-1`: the Charter `environment_matrix` line is corrected in Charter v1.6; the other items named there (Doc 00 §25.3 / SRS open item 26 / `STR-03` §8.3) are outside this task and unchanged.
- Downstream masters (Module Index v1.4, SRS v1.3, Role Matrix v1.3, Workflow Map v1.3, System Rules v1.3) keep their historical v1.5 base-document rows; the STR-04 v0.1–v0.4 citations keep their v1.5 line references (archive copies are byte-identical). Not changed by this task.
