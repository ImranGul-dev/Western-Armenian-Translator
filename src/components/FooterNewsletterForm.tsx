"use client";

import { useEffect, useState } from "react";
import styles from "@/components/Footer.module.css";

export function FooterNewsletterForm() {
  const [startedAt, setStartedAt] = useState("");

  useEffect(() => {
    setStartedAt(String(Date.now()));
  }, []);

  return (
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
      <button
        className={styles.newsletterButton}
        type="submit"
        name="subscribe"
      >
        Join the community
      </button>
    </form>
  );
}
