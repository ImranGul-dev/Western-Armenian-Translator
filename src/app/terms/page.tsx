import { SiteFrame } from "@/components/SiteFrame";

export default function TermsPage() {
  return (
    <SiteFrame>
      <article className="legal-page">
        <p className="eyebrow">Terms</p>
        <h1>Terms of use</h1>
        <p className="legal-updated">Last updated: 5 August 2026</p>
        <h2>Using the service</h2>
        <p>Users are responsible for the content they submit and for how they use translation results. The service must be used lawfully and without infringing the rights of others.</p>
        <h2>Acceptable use</h2>
        <p>Users must not bypass usage limits, automate abusive traffic, interfere with service operation, misuse accounts or submit content they do not have the right to process.</p>
        <h2>Plans and limits</h2>
        <p>Plans may include monthly character allowances, per-request limits, rate limits and feature restrictions. Current prices and limits are displayed before checkout.</p>
        <h2>Subscriptions</h2>
        <p>Paid plans renew according to the billing period shown at checkout. Customers can manage payment methods, invoices, plan changes and cancellation through the Stripe customer portal.</p>
        <h2>Language resources</h2>
        <p>Glossary, grammar and example content remains subject to its ownership and licensing terms. Resources must not be imported without permission for the intended use.</p>
        <h2>Account deletion</h2>
        <p>An active paid subscription must be cancelled or ended before the related application account is permanently deleted.</p>
      </article>
    </SiteFrame>
  );
}
