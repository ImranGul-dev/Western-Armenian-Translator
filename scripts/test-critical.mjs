import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "src/contexts/AuthContext.tsx",
  "src/app/admin/page.tsx",
  "src/app/admin/queries/page.tsx",
  "src/app/admin/subscriptions/page.tsx",
  "src/app/admin/payments/page.tsx",
  "src/app/admin/plans/page.tsx",
  "src/app/dashboard/billing/page.tsx",
  "src/app/dashboard/widget/page.tsx",
  "src/app/admin/widgets/page.tsx",
  "supabase/migrations/20260804000200_commercial_mvp.sql",
  "supabase/migrations/20260805000100_complete_billing_portal.sql",
  "supabase/migrations/20260805000200_production_branding_and_plan_admin.sql",
  "supabase/migrations/20260805000300_embed_widget_and_manual_plan_overrides.sql",
  "supabase/functions/translate/index.ts",
  "supabase/functions/widget-translate/index.ts",
  "supabase/functions/stripe-checkout/index.ts",
  "supabase/functions/stripe-portal/index.ts",
  "supabase/functions/stripe-admin/index.ts",
  "supabase/functions/stripe-webhook/index.ts"
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}`);

const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260805000100_complete_billing_portal.sql"), "utf8");
for (const term of ["billing_payments", "admin_audit_log", "query_review_consent", "admin_commercial_stats", "history_admin_review"]) {
  if (!migration.toLowerCase().includes(term.toLowerCase())) throw new Error(`Phase 3 migration missing ${term}`);
}

const translate = fs.readFileSync(path.join(root, "supabase/functions/translate/index.ts"), "utf8");
for (const term of ["monthlyCharacterLimit", "historyEnabled", "queryReviewConsent", "findRelevantContext", "increment_monthly_usage"]) {
  if (!translate.includes(term)) throw new Error(`Translation function missing ${term}`);
}

const portal = fs.readFileSync(path.join(root, "supabase/functions/stripe-portal/index.ts"), "utf8");
for (const term of ["payment_method_update", "subscription_update", "subscription_cancel", "billingPortal.sessions.create"]) {
  if (!portal.includes(term)) throw new Error(`Billing portal missing ${term}`);
}

const admin = fs.readFileSync(path.join(root, "supabase/functions/stripe-admin/index.ts"), "utf8");
for (const term of ["pause_collection", "cancel_at_period_end", "change_plan", "refund", "recordAdminAudit"]) {
  if (!admin.includes(term)) throw new Error(`Stripe admin function missing ${term}`);
}


const productionMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260805000200_production_branding_and_plan_admin.sql"), "utf8");
for (const term of ["anonymous_usage", "plans_admin_write", "get_public_translation_settings"]) {
  if (!productionMigration.includes(term)) throw new Error(`Production migration missing ${term}`);
}

const plansAdmin = fs.readFileSync(path.join(root, "src/app/admin/plans/page.tsx"), "utf8");
for (const term of ["Anonymous visitor limits", "Stripe recurring Price ID", "Save visitor limits"]) {
  if (!plansAdmin.includes(term)) throw new Error(`Plan administrator missing ${term}`);
}

const checkout = fs.readFileSync(path.join(root, "supabase/functions/stripe-checkout/index.ts"), "utf8");
for (const term of ["stripe_price_id", "unit_amount", "recurring"]) {
  if (!checkout.includes(term)) throw new Error(`Checkout validation missing ${term}`);
}

const widgetMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260805000300_embed_widget_and_manual_plan_overrides.sql"), "utf8");
for (const term of ["user_plan_overrides", "widget_sites", "widget_usage_events", "effective_plan_for_user", "manage_widget_site"]) {
  if (!widgetMigration.includes(term)) throw new Error(`Widget/manual migration missing ${term}`);
}

console.log("Static critical billing, privacy, plan-management, widget and translation architecture checks passed.");
