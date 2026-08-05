# Administrator Guide

## Roles

`user` accesses customer features, `language_editor` manages approved language data and corrections, and `admin` has operational, billing, plan, user, widget, and audit access. Role changes are protected by RLS and the profile protection trigger.

## Manual plan assignment

Open **Admin → Users**. Each row shows Stripe plan/status, effective application plan, plan source, expiration, and widget eligibility.

- **Use billing/default** removes the override and returns resolution to Stripe or Free.
- **Free**, **Premium**, and **Business** create or replace a separate `user_plan_overrides` row.
- Expiration is optional and stops applying automatically when the timestamp passes.
- The reason is internal and included in the audit record.
- Forcing Free does not cancel Stripe or stop charges; the UI requires confirmation and shows a warning.

Manual grants never create Stripe customers, subscriptions, invoices, payments, or webhook events. If a user purchases while an override exists, both records remain and the override keeps priority until removed or expired.

## Plan and widget configuration

Open **Admin → Plans** to configure normal limits, price display/Stripe IDs, widget access, site count, optional separate widget monthly characters, and whether branding can be removed. A blank separate widget allowance means widget usage shares the normal plan allowance.

## Widget operations

Open **Admin → Widgets** to search all installations, inspect owner/effective plan, usage, last use, and blocked requests. Enable/disable, rotate, and delete actions are authorized by `manage_widget_site` and logged with the acting user and an administrator/customer action prefix.

## Billing

Stripe remains the source of truth for paid subscriptions and invoices. Use Admin → Subscriptions and Payments for sync, pause/resume, cancellation, plan changes, and refunds. Never use manual plan controls as a substitute for Stripe cancellation or refund workflows.

## Privacy

Widget usage does not store source or translated text. Main authenticated history is visible to administrators only when the user enabled query-review consent. Anonymous translation text is not stored.
