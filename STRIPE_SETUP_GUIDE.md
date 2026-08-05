# Stripe Billing Guide

Use `PRODUCTION_DEPLOYMENT_CHECKLIST.md` for the final deployment sequence and `COMPLETE_BILLING_SETUP_GUIDE.md` for detailed testing.

The application includes:

- Stripe Checkout.
- Customer Portal and focused portal links.
- Invoice and payment synchronization.
- Customer payment history.
- Card updates.
- Upgrade and downgrade.
- Self-service cancellation.
- Administrator pause, resume, cancellation, plan change, synchronization, and refund operations.
- Verified, idempotent webhooks.
- Administrator audit logging.

The administrator Plans page at `/admin/plans` controls prices, allowances, features, and Stripe Price IDs. Checkout validates the configured Stripe Price before creating a session.

Keep both switches disabled until all test-mode flows pass:

```env
# Frontend .env.local or Netlify
NEXT_PUBLIC_BILLING_ENABLED=false

# Supabase Edge Function secret
BILLING_ENABLED=false
```
