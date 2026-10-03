# Demo accounts

**SYNTHETIC DEMO DATA — no real patients, employees, or PHI.** Every person and record below is fictional.

Open [the live demo](https://DEMO_URL) (URL placeholder) or your local CareOps server. All five accounts use **`careops-demo`** by default. The login page offers shortcuts for the four primary roles; type `sam` into the username field to use the second employee account.

| Username | Display name | Role | Access |
| --- | --- | --- | --- |
| `jordan` | Jordan Lee | Employee | Assistant with HR documents; own PTO balance and requests. Reports to Priya. |
| `priya` | Priya Shah | Manager | Assistant with HR documents; own PTO; approve or deny direct reports Jordan and Sam. |
| `marcus` | Marcus Cole | Billing Specialist | Assistant with HR and billing documents; own PTO; assigned claims, follow-ups, and allowed claim transitions. |
| `dana` | Dana Ortiz | Compliance Admin | Assistant with HR documents; audit and all users' traces; both labs; demo reset. No billing queue or personal PTO workflow. |
| `sam` | Sam Rivera | Employee | Same employee permissions as Jordan, scoped to Sam's own records. Priya's second direct report. |

These accounts and relationships are defined in [seed/data.js](seed/data.js); access is enforced by [src/policy/permissions.js](src/policy/permissions.js) and the API routes. Hiding a navigation item is only a display choice, not the authorization control.

## Starting state

| Account | Available PTO | Pending PTO | Requestable PTO |
| --- | --- | --- | --- |
| Jordan | 40 hours | 0 hours | 40 hours |
| Priya | 64 hours | 0 hours | 64 hours |
| Marcus | 32 hours | 0 hours | 32 hours |
| Sam | 24 hours | 8 hours | 16 hours |

The UI reports available and pending separately; requestable hours are available minus pending. Sam starts with one pending full-day request, dated seven business days after the reset date, so Priya's queue has a request immediately. Jordan starts with none. [src/db/seed.js](src/db/seed.js) creates this state using the server's New York calendar.

Marcus can investigate `CLM-1004`, seeded as denied with code `CO-197` for missing authorization. `CLM-1007` is unassigned, and `CLM-9999` does not exist; neither is exposed through Marcus's claim lookup. The records are intentionally synthetic examples, not real payer guidance.

## Switching accounts and resetting

Use **Logout**, then sign in with the next username. Separate browser profiles or private windows can hold different sessions at once; tabs in the same browser profile share the session cookie.

Dana can open **Audit Log → Reset demo data** and accept the confirmation dialog. Reset affects every viewer: it restores seeded business records, removes created tasks and pending action proposals, and resets idempotency results. Sessions remain signed in. Audit events, traces, provider usage, and lab results remain; KB documents are not reloaded.

`DEMO_PASSWORD` can change the seeded password in a local deployment. Changing the environment alone does not rewrite existing accounts: startup seeds only when no users exist, while an admin reset reapplies the configured password to seeded users. These are public demo credentials and must not be reused for a production system.

Follow the six-step walkthrough in [README.md](README.md). For measured results, see the Attack Lab / Model Lab pages as Dana. See [SECURITY.md](SECURITY.md) for what the account boundaries do and do not protect.
