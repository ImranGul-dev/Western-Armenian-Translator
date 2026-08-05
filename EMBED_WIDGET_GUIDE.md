# Tun Embed Widget Guide

## Eligibility

Widget access follows the user's **effective plan**. The priority is administrator role, an active unexpired manual override, a valid Stripe subscription, then Free. The Plans page controls `widget_enabled`, site count, optional separate widget allowance, and branding removal.

## Create an installation

1. Sign in and open **Dashboard → Website widget**.
2. Enter a descriptive name and the exact host where the widget will run.
3. For production use a host such as `www.example.com`. Do not include a path.
4. For local testing use the exact port, such as `localhost:8080`.
5. Select the direction, theme, and branding setting allowed by the plan.
6. Create the widget and copy the complete embed code.

The public key begins with `wpk_`. It is intentionally publishable, high entropy, unique, revocable, and still requires exact origin and entitlement validation.

## Plain HTML

Paste the generated `<div>` and `<script>` before `</body>`. Do not manually remove `data-endpoint` or `data-supabase-key`; the Supabase key is the browser-safe publishable key, not a service-role secret.

## WordPress

Use a Custom HTML block in the page editor, or place the generated code in a trusted header/footer injection plugin. Ensure optimization plugins do not remove the script's `data-*` attributes. Clear page/CDN caches after changing a rotated key.

## Webflow

Add an Embed element, paste the complete code, publish the site, and register the final published custom domain rather than the Designer preview host. A Webflow staging host needs its own widget installation if it differs from production.

## Local test

1. Run the Next.js app at `http://localhost:3000`.
2. Run Supabase locally and serve Edge Functions.
3. Register `localhost:8080` as the allowed domain.
4. Replace placeholders in `examples/widget-host-test.html`.
5. In the project directory run `python3 -m http.server 8080 --directory examples`.
6. Open `http://localhost:8080/widget-host-test.html`.

The host page intentionally applies conflicting CSS so Shadow DOM isolation can be checked.

After creating the localhost widget, the live endpoint checks can also be run with temporary shell variables:

```bash
WIDGET_TEST_KEY=wpk_REPLACE_ME \
WIDGET_TEST_ORIGIN=http://localhost:8080 \
npm run test:widget-edge
```

The test verifies a successful registered origin, a rejected wrong origin, a rejected missing Origin, and a rejected unsupported language pair.

## Domain validation

The Edge Function requires an `Origin` header and compares `new URL(origin).host` with the normalized registered domain. Matching is exact: `example.com`, `www.example.com`, and `sub.example.com` are separate hosts. Ports are part of non-default localhost origins. Missing or mismatched origins are rejected before OpenAI is called, and CORS is returned only for the validated origin.

## Usage and privacy

By default widget characters count against the owner's normal monthly plan allowance. An administrator can configure a separate widget monthly allowance on the plan. Per-request and per-minute limits also come from the effective plan. Widget usage events store operational metadata, characters, direction, origin, status, and timing; they never store source or translated text.

## Rotate a key

Open the widget, choose **Rotate key**, confirm, copy the new embed code, and replace the old code on the host website. The old key stops working immediately.

## Administrator controls

Administrators use **Admin → Widgets** to search by user, email, name, or domain; review monthly usage and blocked requests; disable or enable a widget; rotate its key; delete it; and open the owner record. All actions are authorized in the database RPC and customer and administrator management actions are written to `admin_audit_log`.

## Troubleshooting

- **Invalid domain / network error:** verify the browser address host exactly matches the registered domain, including a localhost port. Do not open the HTML as `file://` because browsers omit a usable Origin.
- **Disabled key:** enable the installation in the customer or administrator page.
- **Invalid or rotated key:** copy the newest complete embed code.
- **Plan not eligible:** verify the effective plan and its widget settings in Admin → Plans and Admin → Users.
- **Rate limit:** wait at least one minute and retry; administrators can adjust the plan rate limit.
- **Usage limit:** wait for the next month or change the effective plan/allowance.
- **Unsupported direction:** use English → Western Armenian, Western Armenian → English, or Eastern Armenian → Western Armenian.
- **No visible error detail:** a rejected domain intentionally receives no cross-origin permission; check the registered host and the browser console/network panel.
