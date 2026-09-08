# PRT-01 Client / Staff / Admin Portal Workflows
## 02 Workflow

## 1. Workflow Scope

PRT-01 workflows cover portal navigation, status display, sensitive action submission, maker-checker interaction, client dual-authorisation, evidence/report export, incident/freeze display and portal audit.

## 2. WF-PRT01-01 Source-Truth Status Display

1. User opens screen.
2. Portal validates session and permission.
3. Portal calls owning source module.
4. Portal displays status with source module, timestamp and limitations where required.
5. Stale data warning shown if source status is old/unavailable.
6. Sensitive fields masked.
7. View audit emitted for sensitive data.

## 3. WF-PRT01-02 Sensitive Action Submission

1. User initiates action.
2. Portal checks UI permission and context.
3. Step-up/MFA requested where required.
4. Idempotency key created.
5. Backend source module receives request.
6. Source module revalidates IAM/CFG/freeze/context.
7. Portal shows backend result.
8. Portal emits audit event.

Rules:
- frontend control is never sufficient.
- stale page requires backend revalidation.
- duplicate submit returns existing result or conflict.

## 4. WF-PRT01-03 Client Withdrawal Request

1. Client selects whitelisted destination.
2. Portal displays WLT destination status.
3. Client submits withdrawal request.
4. Client dual-authorisation is triggered if mandate requires.
5. Request routed to WDR/LED/AML controls.
6. Portal displays pending/authorised/rejected/paid based on WDR + LED truth.
7. Paid status requires rail finality and LED outcome.

## 5. WF-PRT01-04 Client Trade Request

1. Client requests quote.
2. Portal confirms client eligibility and feature status via backend.
3. Quote shown with disclosed fee/commission and expiry.
4. Client accepts within validity.
5. Request routed to TRD/LED.
6. Portal displays accepted/pending/executed/settled/void/requoted based on TRD + LED truth.
7. No order book/matching UI shown.

## 6. WF-PRT01-05 Staff Worklist

1. Staff opens worklist.
2. Portal filters cases by IAM permission and role.
3. Staff views case evidence with masking.
4. Staff submits action/review.
5. Maker-checker triggered where required.
6. Source module records final decision.
7. Portal shows source outcome.

## 7. WF-PRT01-06 Evidence / Report Export

1. User selects evidence/report.
2. Portal verifies permission.
3. Portal checks masking/export policy.
4. Maker-checker approval requested if sensitive.
5. REC/SEC/INC generates pack.
6. Portal provides controlled download.
7. Download audited.

## 8. WF-PRT01-07 Incident / Freeze UX

1. Portal receives INC freeze/incident context.
2. Affected actions are blocked by backend denial.
3. Portal shows approved client/staff message.
4. Attempts are audited.
5. Release is reflected only after INC resume gate and source confirmation.

## 9. WF-PRT01-08 Communication Template Approval

1. Message template drafted.
2. Compliance/Security/Management approval routed as required.
3. Template is versioned.
4. Portal uses only approved active template.
5. Client-facing message avoids restricted reasons/tipping-off.
