import styles from "@/components/Footer.module.css";

const footerColumns = [
  {
    heading: "Learn",
    links: [
      ["My Lessons", "https://tunapp.com/lessons"],
      ["Learn Armenian Online", "https://tunapp.com/get-started"],
      ["Courses, Flashcards and Workbooks", "https://tunapp.com/shop"],
      ["Armenian Social Network", "https://armeniansocialnetwork.com"],
      ["Western Armenian Tutors", "https://tunapp.com/western-armenian-tutoring"],
      ["Armenian Translation Tool", "https://translatearmenian.com"],
      ["Armenian Verb Conjugations", "https://armenianverbs.com"],
      ["Armenian Keyboard", "https://armeniankeyboard.com"],
      ["Armenian ChatGPT", "https://tunapp.com/chatbot"],
    ],
  },
  {
    heading: "Account",
    links: [
      ["My Account", "https://tunapp.com/my-account/"],
      ["Downloads", "https://tunapp.com/my-account/downloads/"],
      ["Subscriptions", "https://tunapp.com/my-account/subscriptions/"],
      ["Payment Methods", "https://tunapp.com/my-account/payment-methods/"],
      ["Password Recovery", "https://tunapp.com/login/"],
    ],
  },
  {
    heading: "Company",
    links: [
      ["Privacy Policy", "https://tunapp.com/privacy-policy/"],
      ["Website Terms", "https://tunapp.com/website-terms/"],
      ["Affiliate Program", "https://tunapp.com/ambassadors/"],
      ["Blog", "https://tunapp.com/blog"],
      ["Contact Us", "mailto:hello@tunapp.com"],
    ],
  },
] as const;

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4v10.2a4.2 4.2 0 1 1-3-4V13a1.6 1.6 0 1 0 1 1.5V4h2Zm0 0c.5 2.2 1.8 3.6 4 4.2v2.6c-1.5-.2-2.8-.8-4-1.7V4Z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 8.2a3 3 0 0 0-2.1-2.1C17 5.6 12 5.6 12 5.6s-5 0-6.9.5A3 3 0 0 0 3 8.2 31 31 0 0 0 2.6 12 31 31 0 0 0 3 15.8a3 3 0 0 0 2.1 2.1c1.9.5 6.9.5 6.9.5s5 0 6.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-3.8 31 31 0 0 0-.4-3.8ZM10 15V9l5 3-5 3Z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className={styles.root}>
      <div
        className={`${styles.curve} tunapp-footer-curve`}
        aria-hidden="true"
      >
        <div className={`${styles.scene} tunapp-footer-scene`}>
          <img
            className={`${styles.artwork} tunapp-footer-artwork`}
            src="https://tunapp.com/wp-content/uploads/2026/09/Tun-Footer-Translate__.png"
            alt=""
            loading="lazy"
          />
        </div>
      </div>

      <div className={`${styles.footerBar} tunapp-footer-bar`}>
        <div className={styles.footerContent}>
          <div className={styles.footerLinks}>
            {footerColumns.map((column) => (
              <div className={styles.footerColumn} key={column.heading}>
                <h2 className={styles.footerHeading}>{column.heading}</h2>
                <div>
                  {column.links.map(([label, href]) => (
                    <a
                      className={styles.footerLink}
                      href={href}
                      key={label}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {label}
                    </a>
                  ))}
                </div>

                {column.heading === "Company" ? (
                  <>
                    <div className={styles.socialLinks}>
                      <a
                        className={styles.socialLink}
                        href="https://instagram.com/tun.armenian"
                        aria-label="Instagram"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <InstagramIcon />
                      </a>
                      <a
                        className={styles.socialLink}
                        href="https://www.tiktok.com/@tun.armenian"
                        aria-label="TikTok"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <TikTokIcon />
                      </a>
                      <a
                        className={styles.socialLink}
                        href="https://www.youtube.com/@TunOnlineArmenianSchool"
                        aria-label="YouTube"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <YouTubeIcon />
                      </a>
                    </div>

                    <div className={styles.newsletter}>
                      <form
                        className={styles.newsletterForm}
                        action="https://tunapp.us5.list-manage.com/subscribe/post?u=cf919aa58fa15934e1e2a04a0&amp;id=3feeed30f4&amp;f_id=00a043edf0"
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
                        <button
                          className={styles.newsletterButton}
                          type="submit"
                          name="subscribe"
                        >
                          Join the community
                        </button>
                      </form>
                    </div>
                  </>
                ) : null}
              </div>
            ))}
          </div>

          <p className={styles.copyright}>
            Copyright © 2026, Tun Online Armenian School. All rights reserved. For every Armenian who loves their home.
          </p>
        </div>
      </div>
    </footer>
  );
}
