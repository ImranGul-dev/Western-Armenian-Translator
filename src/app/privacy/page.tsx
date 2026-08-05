import { SiteFrame } from "@/components/SiteFrame";

export default function PrivacyPage() {
  return (
    <SiteFrame>
      <article className="legal-page">
        <p className="eyebrow">Privacy</p>
        <h1>Privacy notice</h1>
        <p className="legal-updated">Last updated: 5 August 2026</p>
        <h2>Translation requests</h2>
        <p>Translation content is processed by the service providers required to deliver a result. Operational records may include character counts, language direction, request status and timing.</p>
        <h2>Visitor usage</h2>
        <p>Visitor allowances and abuse protection may use a pseudonymous browser or session identifier together with limited technical request information.</p>
        <h2>Account history</h2>
        <p>Signed-in users can save translation history, delete individual items, clear their history and disable future history in account settings.</p>
        <h2>Administrator query review</h2>
        <p>Signed-in users can choose whether saved translations are available in the administrator quality-review area. This setting can be changed from the account dashboard.</p>
        <h2>Website widgets</h2>
        <p>Embedded widget translation text is processed to return a translation but is not stored in widget usage records. Widget records contain operational details such as the registered installation, website origin, language direction, character count, status and timing.</p>
        <h2>Billing</h2>
        <p>Stripe handles subscription checkout, payment methods, invoices, refunds and the customer billing portal. This application stores synchronized subscription and invoice summaries needed to provide account access and payment history.</p>
        <h2>Account choices</h2>
        <p>Users can manage history, review consent, billing and account deletion from their dashboard. Active subscriptions must be ended before an account is permanently deleted.</p>
      </article>
    </SiteFrame>
  );
}
