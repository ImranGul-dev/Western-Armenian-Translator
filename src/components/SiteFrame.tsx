import type { ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

export function SiteFrame({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <div className="app-frame">
      <Header />
      <main className={`shell main-content ${compact ? "main-content-compact" : ""}`}>{children}</main>
      <Footer />
    </div>
  );
}
