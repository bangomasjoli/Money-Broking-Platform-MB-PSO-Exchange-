# IAM-02 RBAC / Permission Guard / SoD  
## 02 Workflow

## 1. Workflow Scope

IAM-02 workflows cover role/permission assignment, runtime permission checks, maker-checker, SoD, delegation, temporary permission, break-glass, and revocation.

---

## 2. WF-IAM02-01 Runtime Permission Guard

### Trigger

A protected API/action is called.

### Steps

1. Receive FND request context.
2. Confirm IAM-01 authenticated actor context.
3. Load action, resource, entity, and client scope.
4. Check licence-lock/prohibited permission status.
5. Load actor roles and permissions.
6. Evaluate permission condition.
7. Evaluate SoD runtime conflict where required.
8. Verify required step-up assertion where configured.
9. Check approval requirement.
10. Return allow, deny, or approval_required.
11. Emit permission decision event where sensitive.

### Fail-Closed Conditions

1. Missing actor context.
2. Missing client/resource scope.
3. Unknown permission.
4. Unknown licence-lock state.
5. SoD conflict unresolved.
6. Required step-up missing/invalid.
7. Approval policy unresolved.
8. Permission cache stale/invalid.

---

## 3. WF-IAM02-02 Role Assignment

### Trigger

Admin/Security requests role assignment.

### Steps

1. Request role assignment.
2. Validate requester permission.
3. Check target user status.
4. Check role eligibility.
5. Check SoD matrix.
6. Determine approval requirement.
7. Require step-up for privileged role assignment.
8. Create approval request if required.
9. Approver reviews.
10. If approved, assign role.
11. Invalidate permission cache.
12. Emit audit event.

### Rules

1. Self role elevation is prohibited.
2. Privileged role assignment requires approval and step-up.
3. SoD conflict blocks assignment unless formally risk accepted where allowed.
4. Exchange/prohibited role cannot be assigned while locked.

---

## 4. WF-IAM02-03 Permission Assignment to Role

### Steps

1. Request permission assignment to role.
2. Verify permission exists.
3. Check licence-lock/prohibited status.
4. Check role owner and sensitivity.
5. Check SoD implications.
6. Require maker-checker approval.
7. Apply assignment after approval.
8. Invalidate permission cache.
9. Emit audit event.

---

## 5. WF-IAM02-04 Maker-Checker Approval

### Trigger

Sensitive action requires approval.

### Steps

1. Maker initiates action.
2. System creates approval request.
3. Approval policy determines required approver role/count.
4. Candidate approvers listed excluding maker and conflicted users.
5. Approver performs step-up where required.
6. Approver approves or rejects.
7. System checks self-approval and SoD again.
8. If approval threshold met, action may proceed.
9. Approval expires if not completed.
10. Audit event emitted.

### Approval Results

1. Approved.
2. Rejected.
3. Expired.
4. Cancelled.
5. Escalated.
6. Blocked by SoD.

---

## 6. WF-IAM02-05 SoD Conflict Check

### Trigger

Role assignment, permission assignment, approval, delegation, temporary permission, or runtime action.

### Steps

1. Identify actor roles/permissions.
2. Identify proposed role/permission/action.
3. Load conflict matrix.
4. Evaluate direct conflicts.
5. Evaluate inherited conflicts.
6. Evaluate entity-specific conflicts.
7. Return pass, block, or risk_acceptance_required.
8. Audit conflict result.

---

## 7. WF-IAM02-06 Delegation

### Trigger

User delegates approval/permission within policy.

### Steps

1. Delegator requests delegation.
2. Validate delegator permission.
3. Validate delegate eligibility.
4. Check SoD conflict.
5. Define scope and expiry.
6. Determine approval requirement.
7. Approve delegation if required.
8. Activate delegation.
9. Invalidate permission cache.
10. Audit event emitted.

### Rules

1. Delegation must expire.
2. Delegation cannot bypass SoD.
3. Delegation cannot exceed delegator permission.
4. Delegation to conflicted user is blocked.

---

## 8. WF-IAM02-07 Temporary Permission

### Trigger

Temporary permission grant requested.

### Steps

1. Request temporary permission.
2. Validate permission and sensitivity.
3. Validate recipient eligibility.
4. Require approval and step-up where sensitive.
5. Set expiry.
6. Activate temporary permission.
7. Invalidate cache.
8. Auto-expire through scheduled job.
9. Audit activation and expiry.

### Rules

1. Expiry is mandatory.
2. High-risk temporary permission requires approval.
3. Licence-locked permission cannot be temporary granted.

---

## 9. WF-IAM02-08 Break-Glass Access

### Trigger

Emergency access required.

### Steps

1. Request break-glass with reason.
2. Validate emergency category.
3. Require approver who is not recipient.
4. Require IAM-01 step-up for requester and approver.
5. Check licence-lock/prohibited scope.
6. Grant time-boxed emergency permission.
7. Notify Security/Compliance/Management where required.
8. Record all actions.
9. Auto-expire.
10. Require post-event review.
11. Close review with evidence.

### Rules

1. Break-glass cannot bypass licence-lock.
2. Break-glass cannot disable audit.
3. Break-glass cannot be permanent.
4. Break-glass recipient cannot approve own grant.

---

## 10. WF-IAM02-09 Permission Revocation

### Trigger

Role revoked, permission revoked, user disabled, freeze/suspension, SoD conflict found, temporary grant expired, break-glass expired.

### Steps

1. Revoke role/permission/grant.
2. Invalidate permission cache.
3. Notify IAM-01 where session revalidation/revocation is required.
4. Block future use immediately.
5. Reconcile active sessions where required.
6. Audit revocation.

---

## 11. WF-IAM02-10 Client-Side Dual Authorization

### Trigger

Client-side sensitive action requires client approval.

Examples:

1. Withdrawal.
2. Payout-destination creation/change.
3. Large trade.
4. Institutional mandate action.

### Steps

1. Client maker initiates action.
2. Permission guard checks maker permission.
3. Approval request created for client approver.
4. Client approver performs IAM-01 step-up.
5. System checks approver is not maker.
6. Client approver approves/rejects.
7. Action proceeds only after approval threshold met.
8. Audit event emitted.

### Rules

1. Client maker cannot approve own action.
2. Client approval threshold is configurable.
3. Client-side approval does not replace staff/compliance approval where required.
