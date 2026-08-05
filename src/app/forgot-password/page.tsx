import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { SiteFrame } from "@/components/SiteFrame";

export default function ForgotPasswordPage() {
  return <SiteFrame compact><section className="auth-card"><p className="eyebrow">Tun account</p><h1>Reset your password</h1><p>We will send a secure password-reset link to your email.</p><Suspense fallback={<div className="page-state">Loading…</div>}><AuthForm mode="forgot" /></Suspense></section></SiteFrame>;
}
