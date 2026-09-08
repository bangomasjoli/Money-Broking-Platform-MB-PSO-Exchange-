# AIX Full Compliance — Decision Log

Concise ADR-style entries for high-value, already-established governance decisions.
This is not a record of every historical implementation decision — see
`00_project_state/PROJECT_HANDOVER.md` for the full implementation chronology.

---

### DEC-001 — This git repository is the future single authoritative documentation and code source

- **Date:** 2026 (repository creation, prior turn)
- **Scope:** Repository-wide
- **Decision:** `Money-Broking-Platform-MB-PSO-Exchange-` (this repo, `docs/` + `platform/`)
  is intended to become the single authoritative source for both documentation and code,
  superseding the live, non-git-tracked `aix-platform-docs` and `aix-platform` trees.
- **Rationale:** Two live, non-version-controlled directories with no change history or
  audit trail are unsuitable as an authoritative record for a regulated financial
  platform's SDLC evidence.
- **Status:** ACCEPTED — cutover itself (retiring the live trees, adding compatibility
  symlinks) is **not yet executed**. That is Turn D, not yet authorized.
- **Supersedes / Related:** None
- **Baseline commit:** `e74effd` (initial repository commit)

### DEC-002 — Module-centric documentation structure

- **Date:** Document Control & Repository Information Architecture review (prior turn)
- **Scope:** `docs/` directory structure
- **Decision:** Documentation is organized primarily by module
  (`docs/02_modules/<MODULE>/{blueprint,reviews,acceptance,notes}/`), not by document
  type or project phase alone.
- **Rationale:** The platform's build and acceptance unit is the module; grouping all
  of a module's blueprint, review, acceptance, and implementation-note evidence under
  one path makes the evidence trail auditable per module.
- **Status:** ACCEPTED and implemented (Turns A, A.1, B)
- **Supersedes / Related:** Related to DEC-001
- **Baseline commit:** `c1765f5`

### DEC-003 — Git is the primary change-history mechanism

- **Date:** Document Control & Repository Information Architecture review (prior turn)
- **Scope:** Repository-wide
- **Decision:** All document moves use `git mv` to preserve rename history; no document
  is silently duplicated or deleted where a move suffices. Content changes are committed
  separately from structural moves (Turns A/A.1/B are moves-only; Turn C1 is the first
  turn with intentional content changes).
- **Rationale:** Preserves auditability — reviewers can distinguish "this file moved"
  from "this file's content changed" via `git log --follow` and diff stats.
- **Status:** ACCEPTED and enforced across Turns A, A.1, B, C1
- **Supersedes / Related:** None
- **Baseline commit:** `c1765f5`

### DEC-004 — Blueprint version promotion requires review or delta-note certification

- **Date:** Turn C1 (this turn)
- **Scope:** Module blueprint pack version authority
- **Decision:** A blueprint pack version is authoritative only when a `*_Review.md` or
  `*_v1.x_to_v1.y_Delta_Note.md` exists in the repository certifying it. Version number,
  file modification date, or mere presence on disk do not confer authority.
- **Rationale:** Repository inspection found 11 modules with a `v1.2` pack present but
  no certifying evidence, and one module (WLT-01) with an active documented conflict
  between two tracking documents about which version is controlling. Silent
  version-number-based promotion would have papered over that conflict.
- **Status:** ACCEPTED and implemented in `DOCUMENT_REGISTER.md`
- **Supersedes / Related:** Directly addresses the WLT-01 conflict (see `OPEN_FINDINGS.md`
  is not the right place for this — it is a document-authority question, tracked instead
  as `BP-WLT-01-v1.2` in `DOCUMENT_REGISTER.md`)
- **Baseline commit:** `c1765f5`

### DEC-005 — Open findings are owned by OPEN_FINDINGS.md

- **Date:** Turn C1 (this turn)
- **Scope:** Repository-wide
- **Decision:** `docs/OPEN_FINDINGS.md` is the single current register for unresolved
  findings, deferred controls, environment issues, and blockers. `PROJECT_HANDOVER.md`
  remains the historical narrative of when/how findings arose but is no longer the place
  to look for current status.
- **Rationale:** Findings were previously scattered across `PROJECT_HANDOVER.md` prose,
  `MODULE_STATUS.md` table cells, and individual acceptance review documents, with no
  single current view and no stable finding IDs.
- **Status:** ACCEPTED and implemented
- **Supersedes / Related:** None
- **Baseline commit:** `c1765f5`

### DEC-006 — Document version authority is owned by DOCUMENT_REGISTER.md

- **Date:** Turn C1 (this turn)
- **Scope:** Repository-wide
- **Decision:** `docs/DOCUMENT_REGISTER.md` (formerly `INDEX.md`) is the sole authority
  for controlled-document version, document status, and supersession. `MODULE_STATUS.md`
  no longer carries a competing blueprint-version-authority column; it owns
  implementation status only.
- **Rationale:** `INDEX.md` and `MODULE_STATUS.md` had drifted into disagreement on at
  least one module (WLT-01: `v1.1` vs `v1.2`) with no mechanism to detect or resolve the
  conflict. A single authority removes the possibility of two documents silently
  disagreeing.
- **Status:** ACCEPTED and implemented
- **Supersedes / Related:** `INDEX.md` (renamed/merged via `git mv`, not deleted)
- **Baseline commit:** `c1765f5`

### DEC-007 — AIX Full Compliance is a distinct project from AIX Revamp

- **Date:** Established prior to this turn; restated explicitly per-turn since
- **Scope:** Repository-wide, project identity
- **Decision:** "AIX Full Compliance" (this repository, this document set) must never be
  merged, cross-referenced as equivalent, or conflated with the older "AIX Revamp"
  project.
- **Rationale:** Explicit user instruction, repeated at the start of every Turn C
  directive, to prevent scope/identity confusion between the two projects.
- **Status:** ACCEPTED — standing constraint
- **Supersedes / Related:** None
- **Baseline commit:** N/A (organizational constraint, not tied to a specific commit)

---

Future decisions should be appended below this line, oldest first, using the same
`DEC-NNN` numbering.
