---
title: Payer A Provider Manual (Synthetic)
collection: careops-billing
---

This manual describes Payer A rules for the CareOps synthetic billing demonstration. Payer A is fictional, and the example records do not represent real patients or coverage decisions. Billing staff should use the claim record, the applicable payer section, and the denial-management procedure together when preparing a follow-up. A policy explanation alone does not establish that a claim is ready for resubmission.

## §4.1 Covered home-health services

Covered home-health services include skilled home-health visits when the applicable coverage and documentation requirements are met. Review the service date, claim details, and supporting authorization records as part of the billing review. A service category appearing in this manual does not establish that every submitted visit will be paid.

Keep follow-up notes focused on the missing evidence and the next step. If a claim record cannot be found in the assigned queue, do not infer a patient, amount, or denial reason from another claim with a similar identifier.

## §4.2 Prior Authorization

Skilled home-health visits require **prior authorization before the first visit**. Missing authorization is denied with code **CO-197**. This code should prompt an authorization-documentation review, rather than an assumption that the service itself is excluded from coverage.

The remedy is to **obtain the authorization documentation, submit a retro-authorization request within 30 days of the denial, then resubmit the claim**. Check the denial date when planning this work. Record what documentation is needed and identify the next step in a follow-up note.

Use an **AUTH_DOCUMENTATION** follow-up task under the Claim Denial Management SOP. Gather and attach the authorization records in the billing workflow before resubmitting. Creating a follow-up task records work to be done; it does not itself obtain authorization or prove that the payer has approved the claim.

## §6 Timely filing

The timely filing window is **90 days**. Track filing requirements separately from the 30-day retro-authorization deadline after a denial. Staff should review the applicable dates before taking action and ask the billing supervisor to review any uncertainty. Keep the next action visible in the claim's follow-up record so another staff member can continue the work.
