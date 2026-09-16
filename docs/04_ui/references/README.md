---
document_id: UI-REF-IDX
title: AIX UI — Reference Image Directory Index
version: N/A
document_status: DRAFT
implementation_status: N/A
module: N/A
control: Visual reference image storage and registration rule
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: c5981ac
---

# AIX UI — Reference Image Directory Index

Storage location for visual reference images actually copied into this
repository, registered against the Reference Register in
`../AIX_UI_DESIGN_FOUNDATION_v0.1.md` §14.

## Rule

**Only register an image file that actually exists in this directory.**
Never invent a path or a placeholder file. If a reference is discussed but
its image has not yet been supplied by the user and committed here, the
corresponding Reference Register row must state:

> **REFERENCE IMAGE FILE: PENDING USER-SUPPLIED FILE**

A design specification may still proceed *conceptually* from a reference
whose image is pending — see `AIX_UI_MEASUREMENT_SPEC_v0.1.md` §1 for how
`REF-UI-001` (Phantom.com floating pill navigation) is currently handled
under this rule.

## Current contents

**Empty.** No reference image has been copied into this repository as of
this revision. `REF-UI-001`'s Phantom.com screenshot has not been supplied.

| File | Reference ID | Status |
|---|---|---|
| — | `REF-UI-001` | **PENDING USER-SUPPLIED FILE** |

## When an image is supplied

1. Copy the file into this directory (no external links — Git is
   authoritative; a reference image must be retrievable from this
   repository alone).
2. Use a descriptive, stable filename (e.g. `ref-ui-001-phantom-nav.png`),
   not a generic name like `image1.png`.
3. Update the table above with the real filename.
4. Update the corresponding Reference Register row (in
   `../AIX_UI_DESIGN_FOUNDATION_v0.1.md` and/or
   `../AIX_UI_MEASUREMENT_SPEC_v0.1.md`, whichever currently carries it) to
   reference the exact relative path instead of "PENDING USER-SUPPLIED
   FILE."
5. Do not re-derive or change the reference's approved **scope** (e.g.
   `REF-UI-001`'s scope remains the floating pill navigation treatment
   only) merely because an image was added — scope changes are a separate,
   explicit decision.
