# DOC-ALIGN-001 — Joint v1.6 Promotion: Review and Acceptance Record

**Status: REVIEW RECORD — owner acceptance recorded separately in [`06-acceptance.md`](06-acceptance.md) (APPROVED 2026-10-22).** This record is the review; it is not itself the acceptance.

| | |
|---|---|
| Task | `DOC-ALIGN-001` (controlled documentation alignment) |
| Documents | ARC-00 `00_Licence_Scope_And_Feature_Lock` **v1.6** and ARC-01 `01_Project_Charter` **v1.6** — joint promotion only |
| Source baseline | `main` = `f366403a9a9d45d3425d7b41dd2fda94cd13e956` (merge of PR #2, `PROJECT-MANDATE-001`); branch `docs/DOC-ALIGN-001`; nothing committed |
| Authoritative today | ARC-00 v1.5 and ARC-01 v1.5 (`DOCUMENT_REGISTER.md`), unchanged and still in `docs/01_masters/` |
| Drafting model | Claude Sonnet 5.5 |
| Detail | [`01-delta-and-verification.md`](01-delta-and-verification.md) (section-by-section before/after and proof) |

## 1. Independent review

- **Reviewer:** an independent GPT review, **as reported to this working session by the owner/reviewer.** No signed review artefact, execution ID or transcript is held in this repository, and none is claimed here.
- **Result reported:** **ACCEPT — suitable for joint promotion.**
- **Evidence given to the reviewer:** the complete unified diffs of each candidate against its approved v1.5 master (Doc 00: 26 replacements, +59/−28 lines; Charter: 20 replacements, +59/−21 lines), after two focused correction rounds. The reviewer also checked `platform/services/cfg1/src/lib/doc00-baseline.ts` (see §5).
- **Preceding work:** the draft and two correction rounds were produced by the drafting model and are not independent review.

## 2. Material changes and rationale

Wording alignment only; full table in `01-delta-and-verification.md` §§1, 2, 8.

| Area | Change | Basis |
|---|---|---|
| Ownership (Doc 00 §1.A, §1.C; Charter §3, §4) | Software is independently owned, separate from AIX Investment Group and its licences; holds no regulatory licence; owning/acquiring/licensing it confers no operating authority; a buyer or operator may hold its own licences, to be established independently before regulated operation (no buyer asserted unlicensed). The AIX licence list is kept verbatim as a **reference regulatory design assumption**. `D-1`, `D-2` open | `STATE-006` §2, §15 C-1 |
| Exchange vs Money Broking (Doc 00 §8.1 item 5, §8A row 5, §10.1 item 5, §12.1 items 1–2, §13 note; Charter §6 row, §22 items 2/9/20, §23 row, §29) | MB bans stated as permanent and every-environment; securities Exchange (`EXO-01`) stated as build-authorised, production-gated, never reachable from MB; securities-token trading prohibited via the MB route, production-locked for live trading | `DEC-012` cl. 3; `DEC-013` cl. 5, 7, 9; Doc 00 §9A, §12E, §20.5 |
| Qualified items (Doc 00 §8.1 items 10, 13; §8A rows 10, 13 class B) | "where currently prohibited", approving nothing; a clarification of the accepted `DEC-013` qualification, not authorisation of new development or removal of a standing restriction; no flag or registry change | `DEC-013` cl. 6; Doc 00 §20.6 |
| Stale references (Charter §1, §6, §29; §31 annotated "historical — do not execute"; five canonical environments, `staging` = pre-production mirror inheriting PRODUCTION's gate, not a sixth) | Corrected or marked historical; §31 prompt text untouched | `DEC-013` cl. 2; Charter §26.1 rule 9; `MIG-005` |

**Promotion housekeeping (no substantive change):** version v1.6; draft-candidate text removed; final APPROVED front matter and Document Control status (no conditional/PENDING markers); supersedes fields; Charter §16.4 sign-off status note (§16.4/§16.5 requirements unchanged); Doc 00 §26 now carries a v1.6 promotion-record table (status as prepared) with the v1.5 table kept and labelled historical; Doc 00 §17 and §24 gate 1 version/status references; Charter active citations of Doc 00 (`§2`, `§3`, `§4`) moved to v1.6, and the §12A provenance note ("Derived from Doc 00 v1.5 (substance unchanged in Doc 00 v1.6)"). Historical v1.5 statements, the v1.5 banners (relabelled "retained as history"), §25 and §17's re-baseline sequence were left as written.

## 3. Controls preserved

No MB Spot client-to-client matching, internal order book or matching engine; no proprietary market making, principal dealing or AIX principal liquidity; agency / external-LP execution; securities classification gate; no securities-featured assets through the MB route; default-deny capability activation; maker-checker; ledger and client-money integrity; financial and security controls; existing permissions and safeguards. Sections carrying these are unchanged from v1.5. `assertNoExchangeRuntime` ACTIVE; `exchange.*` frozen, `securities_market.*` separate.

## 4. Open decisions and states preserved

`STATE-006` APPROVED (owner-accepted 2026-10-21) · `DEC-011`–`DEC-014` unchanged · `DEC-015` NOT_ACCEPTED · `R6-Q1` OPEN (not answered; external demonstration of gated capabilities not declared permitted; internal authorised synthetic testing not blocked) · `D-1` OPEN · `D-2` OPEN · `MIG-001` NOT AUTHORISED · `MIG-008` NOT AUTHORISED · Securities Exchange: BUILD AUTHORISED / PRODUCTION ACTIVATION GATED.

## 5. CFG-01 hash determination

`computeDoc00BaselineHash()` hashes `DOC00_SOURCE_VERSION`, `DOC00_LICENCE_PROFILES` and `DOC00_PROHIBITED_FEATURES` (`platform/services/cfg1/src/lib/doc00-baseline.ts`); it does not read or hash the Markdown (confirmed by the independent reviewer and by a read-only inspection in this task). The promotion changes none of those inputs. **No CFG-01 source change; no registry change; no migration; no seal recalculation or reseal; no runtime-control change.** `MIG-008` (bumping the stale `DOC00_SOURCE_VERSION = "v1.3"` label, which requires a reseal) remains separately controlled and not authorised. **This record does not state or imply that v1.6 is synchronised into CFG-01.**

## 6. Joint-promotion dependency

ARC-00 v1.6 and ARC-01 v1.6 are promoted together or not at all. Charter v1.6 names Doc 00 v1.6 as its base document; Doc 00 v1.6 names Charter v1.6 as the document that must use its scope. Neither is authoritative alone; v1.5 of both remains authoritative until the owner approves and the change is integrated. The v1.5 promotion evidence (`01_masters/reviews/…_v1.5_Review.md`, `STR-03`) is retained as **historical v1.5 evidence only** and is not a v1.6 review.

## 7. Promotion package (final form)

The v1.6 masters carry final APPROVED front matter and **no conditional or PENDING markers**. They became the authoritative masters on the owner-approved documentation-only promotion commit (see `06-acceptance.md`); the v1.5 originals were then removed from `01_masters/` after the archive integrity check.

| Item | Path | State |
|---|---|---|
| ARC-00 v1.6 | `docs/01_masters/00_Licence_Scope_And_Feature_Lock_v1.6.md` | new, untracked |
| ARC-01 v1.6 | `docs/01_masters/01_Project_Charter_v1.6.md` | new, untracked |
| Review evidence (authority rule) | `docs/01_masters/reviews/00-01_v1.5_to_v1.6_Delta_Note.md` | new, untracked |
| v1.5 archive copies | `docs/90_archive/masters/00_…_v1.5.md`, `01_Project_Charter_v1.5.md` | byte-identical to the originals (blobs `8cd7ad4f…`, `7172bd4e…`); the originals were removed from `01_masters/` in the promotion commit |
| Register | `docs/DOCUMENT_REGISTER.md` ARC-00/ARC-01 rows + joint-promotion note | edited. Effective Date `2026-10-22` (owner approval date); Baseline Commit = verified source baseline `f366403`; the promotion commit is identified through repository history and may be recorded in a later metadata checkpoint |
| Current-authority pointers | `CLAUDE.md`, `docs/README.md`, `docs/00_project_state/{CURRENT_STATE,MODULE_STATUS,CLAUDE_CODE_USAGE_RULES}.md`, `platform/README.md` | v1.5 → v1.6 pointers only (plus one CURRENT_STATE §9 sentence now resolved) |
| Publication metadata | both masters | `baseline_commit` = verified source baseline `f366403a…`; no promotion SHA invented |

## 8. Owner promotion status

| Field | Value |
|---|---|
| Owner approval of joint promotion | **APPROVED — 2026-10-22 (Asia/Kuching)**; recorded in `06-acceptance.md` |
| Accepted commit | the commit carrying `06-acceptance.md` (not named here; a commit cannot contain its own SHA) |
| Charter §16.4 six-role sign-off; §16.5 formal approval | **Not provided by the owner's approval of the alignment; outstanding** — see the Charter §16.4 note and the delta note §3 |
