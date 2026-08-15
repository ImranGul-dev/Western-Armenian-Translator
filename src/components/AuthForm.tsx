"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function AuthForm({ mode }: { mode: "login" | "signup" | "forgot" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.push(next);
        router.refresh();
      } else if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: name,
              country_code: countryCode,
            },
            emailRedirectTo: `${location.origin}${next}`
          }
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          router.push(next);
          router.refresh();
        } else {
          setMessage("Account created. Confirm your email, then continue to your selected plan.");
        }
      } else {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` });
        if (resetError) throw resetError;
        setMessage("Password reset email sent.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const nextParam = next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <form className="auth-form" onSubmit={submit}>
            {mode === "signup" && (
        <>
          <label>
            Display name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </label>

          <label>
            Country
            <select
              required
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
              autoComplete="country"
            >
              <option value="">Select your country</option>
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>Email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /></label>
      {mode !== "forgot" && <label>Password<input type="password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>}
      <button className="primary-button full-button" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset email"}</button>
      {error && <p className="form-message error">{error}</p>}
      {message && <p className="form-message success">{message}</p>}
      <div className="auth-links">
        {mode === "login" ? <><Link href="/forgot-password">Forgot password?</Link><Link href={`/signup${nextParam}`}>Create account</Link></> : <Link href={`/login${nextParam}`}>Back to login</Link>}
      </div>
    </form>
  );
}
