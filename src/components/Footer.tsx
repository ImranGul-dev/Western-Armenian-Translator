import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <div>
          <strong>Tun Western Armenian Translator</strong>
          <span>© {new Date().getFullYear()} Tun. All rights reserved.</span>
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          <Link href="/pricing">Pricing</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
