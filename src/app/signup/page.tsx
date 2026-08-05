import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { SiteFrame } from "@/components/SiteFrame";

export default function SignupPage() {
  return <SiteFrame compact><section className="auth-card"><p className="eyebrow">Tun account</p><h1>Create an account</h1><p>Save translations, track usage and choose a premium plan when ready.</p><Suspense fallback={<div className="page-state">Loading…</div>}><AuthForm mode="signup" /></Suspense></section></SiteFrame>;
}
