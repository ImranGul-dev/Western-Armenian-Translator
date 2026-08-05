import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { SiteFrame } from "@/components/SiteFrame";

export default function LoginPage() {
  return <SiteFrame compact><section className="auth-card"><p className="eyebrow">Tun account</p><h1>Log in</h1><p>Access your saved history, usage, billing and account settings.</p><Suspense fallback={<div className="page-state">Loading…</div>}><AuthForm mode="login" /></Suspense></section></SiteFrame>;
}
