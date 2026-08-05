import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260805000300_embed_widget_and_manual_plan_overrides.sql", "utf8");
const usersPage = fs.readFileSync("src/app/admin/users/page.tsx", "utf8");
const account = fs.readFileSync("supabase/functions/_shared/account.ts", "utf8");

for (const term of [
  "user_plan_overrides",
  "effective_plan_for_user",
  "admin_set_user_plan_override",
  "manual_plan_override_set",
  "manual_plan_override_removed",
  "admin_audit_log",
  "expires_at > now()",
  "status in ('active','trialing','past_due')",
  "access_suspended"
]) assert.ok(migration.includes(term), `Manual-plan migration missing ${term}`);

const overridePosition = migration.indexOf("from public.user_plan_overrides");
const subscriptionPosition = migration.indexOf("from public.subscriptions", overridePosition);
const freePosition = migration.indexOf("where slug = 'free'", subscriptionPosition);
assert.ok(overridePosition > 0 && subscriptionPosition > overridePosition && freePosition > subscriptionPosition, "Effective-plan priority must be manual, Stripe, then Free");

const adminFunction = migration.slice(migration.indexOf("create or replace function public.admin_set_user_plan_override"), migration.indexOf("create or replace function public.get_my_widget_sites"));
assert.ok(!/insert\s+into\s+public\.(subscriptions|billing_payments|stripe_webhook_events)/iu.test(adminFunction), "Manual grants must not create Stripe records");
assert.ok(usersPage.includes("Use billing/default"), "Admin users page must support returning control to billing/default");
assert.ok(usersPage.includes("does not cancel the active Stripe subscription"), "Admin users page must warn when forcing Free during billing");
assert.ok(account.includes("effective_plan_for_user"), "Main translation account resolver must use centralized effective-plan logic");

console.log("Static manual-plan authorization, priority, expiry, audit and Stripe-separation checks passed.");
