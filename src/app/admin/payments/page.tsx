"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function AdminPaymentsPage() {
  return (
    <ProtectedRoute roles={["admin"]}>
      <DashboardShell
        admin
        title="Payments"
        description="Payment collection, invoices, refunds, tax and payment methods are managed in Tun WooCommerce."
      >
        <section className="dashboard-card">
          <div className="card-heading">
            <div>
              <h2>WooCommerce payment management</h2>
              <p>
                Use the Tun WooCommerce dashboard for payment history, invoices, refunds and payment troubleshooting.
              </p>
            </div>
          </div>

          <p>
            The translator app only keeps the verified subscription status needed to control paid access. It does not manage payment transactions from this page.
          </p>

          <a
            className="primary-button inline-button"
            href="https://tunapp.com/"
            target="_blank"
            rel="noreferrer"
          >
            Open Tun
          </a>
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}
