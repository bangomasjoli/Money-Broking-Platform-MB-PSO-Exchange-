# PRT-01 Client / Staff / Admin Portal Workflows
## 02 Workflow

## 1. Workflow Scope

PRT-01 workflows cover portal navigation, status display, sensitive action submission, maker-checker interaction, client dual-authorisation, evidence/report export, incident/freeze display and portal audit.

## 2. WF-PRT01-01 Source-Truth Status Display

1. User opens screen.
2. Portal validates session and permission.
3. Portal checks object-level entitlement for the requested object.
4. Portal calls owning source module re-scoped to end-user entitlement.
5. Portal retrieves source status version/epoch and overlay state.
6. Portal applies non-regression and overlay precedence.
7. Portal displays status with source module, version, timestamp and limitations where required.
8. Stale/unavailable source shows degraded/unavailable, not green.
9. Sensitive fields masked at source/policy engine where required.
10. View audit emitted for sensitive data.

## 3. WF-PRT01-02 Sensitive Action Submission

1. User initiates action.
2. Portal checks UI permission and context.
3. Step-up/MFA requested where required.
4. Correlation ID and idempotency key created.
5. Portal validates invalidation epoch freshness.
6. Backend source module receives request with end-user entitlement and correlation ID.
7. Source module revalidates IAM/CFG/freeze/context.
8. Portal shows backend result using source-truth display rules.
9. Portal emits SEC audit event with correlation ID.

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
3. Quote shown with source-backed itemised disclosed fee/commission and expiry.
4. Quote screen binds server quote ID/hash/economics.
5. Client accepts within validity.
6. Portal sends quote ID/hash only; client-posted economics rejected.
7. Request routed to TRD/LED.
8. Portal displays accepted/pending/executed/settled/void/requoted based on TRD + LED truth.
9. No order book/matching UI shown.

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
2. Portal verifies permission and object entitlement.
3. Portal captures recipient, purpose and lawful/regulatory basis.
4. Portal requests REC/SEC/INC/source policy engine to apply masking.
5. Maker-checker approval requested if sensitive.
6. Permission/freeze/legal-hold/tipping-off rechecked at generation.
7. REC/SEC/INC generates pack.
8. Recipient-bound single-use expiring download token issued.
9. Permission/freeze/legal-hold/tipping-off rechecked at download.
10. Watermark/disclosure log applied where required.
11. Download audited.

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

---

## 10. WF-PRT01-09 Push Invalidation Handling

### Trigger

INC/AML/WLT/REC/DEP/WDR/TRD/LED invalidation epoch update.

### Steps

1. Receive invalidation event.
2. Match affected client/object/scope.
3. Invalidate display cache and pending notifications.
4. Disable sensitive actions requiring affected state.
5. Force source revalidation on next display/action.
6. Emit SEC audit event where critical.

### Fail-Closed Rule

If subscription is lost or epoch is stale, portal assumes status may be stale and fails closed for sensitive screens/actions.

---

## 11. WF-PRT01-10 Notification Reconcile-Before-Send

### Steps

1. Prepare notification from source event.
2. Load current source status version.
3. Check supersession chain.
4. Suppress stale contradictory notice.
5. Replace with superseding notice where required.
6. Send mandatory notices regardless of opt-out where permitted/required.
7. Audit notification decision.

---

## 12. WF-PRT01-11 File Upload Safety

### Steps

1. Validate file type, extension, content type and size.
2. Store in quarantine area.
3. Malware scan.
4. Sanitize CSV/formula injection where applicable.
5. Block active content where prohibited.
6. Prevent SSRF/path traversal/parser abuse.
7. Pass safe file reference to owning source module.
8. Emit SEC audit event.
