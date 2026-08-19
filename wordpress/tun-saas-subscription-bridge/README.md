# Tun SaaS Subscription Bridge

This tiny WordPress/WooCommerce plugin carries Tun's short-lived checkout token from the SaaS checkout URL onto the WooCommerce order and resulting WooCommerce Subscription.

It does **not** process payments, store card data, call Supabase directly, or contain secrets. WooCommerce/WooPayments remains the payment source of truth. The existing WooCommerce `Subscription updated` webhook sends the subscription to Supabase, where the webhook signature and checkout token are verified.

## Installation

1. Zip the `tun-saas-subscription-bridge` folder so the PHP file is at the root of the ZIP.
2. In WordPress Admin open **Plugins > Add New Plugin > Upload Plugin**.
3. Upload the ZIP and activate **Tun SaaS Subscription Bridge**.
4. Leave the existing WooCommerce webhook enabled:
   - Topic: `Subscription updated`
   - Delivery URL: `https://indgjoridkhnazitubom.supabase.co/functions/v1/woocommerce-webhook`

No WordPress secret or API credential is required by this plugin.

## Account-link flow

1. An authenticated Tun user chooses Person or Schools.
2. `woocommerce-checkout` creates a 30-minute opaque token and stores only its SHA-256 hash in Supabase.
3. The browser is redirected to the mapped `tunapp.com` checkout URL with `tun_checkout=<token>`.
4. This plugin stores the token on the WooCommerce order and subscription as private meta `_tun_checkout_token`.
5. The signed WooCommerce subscription webhook returns that private meta to Supabase.
6. Supabase verifies the WooCommerce HMAC signature, hashes the returned token, resolves the exact Tun user and selected server-owned product mapping, and consumes the checkout session.
7. WooCommerce `active` grants the mapped SaaS plan. Leaving `active` removes paid SaaS access according to the current project rule.
