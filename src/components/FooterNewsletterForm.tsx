"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import styles from "@/components/Footer.module.css";

export function FooterNewsletterForm() {
  const [startedAt, setStartedAt] = useState("");

  useEffect(() => {
    setStartedAt(String(Date.now()));
  }, []);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <form
        className={styles.newsletterForm}
        action="/api/newsletter"
        method="post"
        target="_blank"
      >
        <label
          className={styles.newsletterLabel}
          htmlFor="tun-footer-email"
        >
          Email address
        </label>
        <input
          className={styles.newsletterEmail}
          id="tun-footer-email"
          type="email"
          name="EMAIL"
          placeholder="Enter your email here"
          autoComplete="email"
          required
        />
        <div
          className={styles.newsletterHoneypot}
          aria-hidden="true"
        >
          <input
            type="text"
            name="b_cf919aa58fa15934e1e2a04a0_3feeed30f4"
            tabIndex={-1}
            defaultValue=""
          />
        </div>
        <input
          type="hidden"
          name="_newsletter_started_at"
          value={startedAt}
          readOnly
        />
        <div
          className="cf-turnstile"
          data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
          data-appearance="interaction-only"
          data-action="newsletter_signup"
        />
        <button
          className={styles.newsletterButton}
          type="submit"
          name="subscribe"
        >
          Join the community
        </button>
      </form>
    </>
  );
}
