# IAM-01 Authentication / MFA / Session  
## 15 Regulatory Mapping

## 1. Rule-ID Mapping

| IAM-01 Control | Master Rule / Control | Tests |
|---|---|---|
| Authentication required | IAM-RULE-001, SYS-RULE-001 | IAM1-TC-001 to 008 |
| MFA for staff/admin | IAM-RULE-001, SEC-RULE-003 | IAM1-TC-017 to 027 |
| Privileged phishing-resistant MFA | SEC-RULE-003, GOV-RULE-001 | IAM1-TC-023/024 |
| Password security | SEC-RULE-003, DATA-RULE-001 | IAM1-TC-009 to 016 |
| Session security | IAM-RULE-001, SEC-RULE-003 | IAM1-TC-028 to 036 |
| Rate limiting | SYS-RULE-005 | IAM1-TC-004, IAM1-TC-037 |
| Audit events | SEC-RULE-001, SEC-RULE-002 | IAM1-TC-007, IAM1-TC-049 to 051 |
| Data protection | DATA-RULE-001, DATA-RULE-002 | IAM1-TC-016, 027, 036, 052 |
| Service account security | VND-RULE-003, SEC-RULE-003 | IAM1-TC-043 to 048 |
| Go-live assurance | GOV-RULE-001 | IAM1 go-live suite |

---

## 2. Workflow Mapping

| Workflow | Tests |
|---|---|
| WF-IAM01-01 User Login | IAM1-TC-001 to 008 |
| WF-IAM01-02 MFA Enrolment | IAM1-TC-017/018 |
| WF-IAM01-03 MFA Challenge | IAM1-TC-019 to 022 |
| WF-IAM01-04 Password Reset | IAM1-TC-011 to 016 |
| WF-IAM01-05 Session Refresh | IAM1-TC-031/032 |
| WF-IAM01-06 Session Revocation | IAM1-TC-029/030/033/034/035 |
| WF-IAM01-07 MFA Reset | IAM1-TC-025/026 |
| WF-IAM01-08 Lockout | IAM1-TC-037/038 |
| WF-IAM01-09 New Device/Location | IAM1-TC-039/040/041/042 |
| WF-IAM01-10 Service Account | IAM1-TC-043 to 048 |

---

## 3. Data-Flow Mapping

| Data Flow | IAM-01 Control | Tests |
|---|---|---|
| DF-23 Auth/Session/MFA | Login, MFA, session, token lifecycle | IAM1-TC-001 to 048 |
| DF-26 App/Security Log and PII Scrubbing | No credential/token logs | IAM1-TC-008/016/027/036/041 |
| Notification data flow | New login/reset/MFA notification | IAM1-TC-039 to 042 |
| Audit/outbox flow | Auth audit events | IAM1-TC-049 to 051 |
| Scheduler/job flow | Cleanup/reconciliation jobs | Reconciliation tests |

---

## 4. Regulatory Support

IAM-01 supports:

1. Secure access control foundation.
2. Staff/admin MFA.
3. Client account protection.
4. Evidence of auth events.
5. Fraud/account-takeover monitoring.
6. Data protection for credentials and MFA secrets.
7. Operational resilience through session/token cleanup.
