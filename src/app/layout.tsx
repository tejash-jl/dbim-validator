import type { Metadata } from "next";
import Link from "next/link";
import { Noto_Sans, Noto_Sans_Devanagari } from "next/font/google";
import { DBIM_SOURCE_URL, DBIM_VERSION } from "@/lib/dbim/spec";
import "./globals.css";

const noto = Noto_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-noto" });
const notoDeva = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "600"], variable: "--font-noto-deva" });

const DESCRIPTION =
  "Free, open-source checker for Government of India websites. Validates any URL against the Digital Brand Identity Manual (DBIM) v3.0 and its Annexure F compliance checklists: colours, typography, icons, logo lockup, header and footer, imagery, content, accessibility and performance.";

export const metadata: Metadata = {
  metadataBase: process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN) : undefined,
  title: { default: "DBIM Validator: Digital Brand Identity Manual compliance checker", template: "%s · DBIM Validator" },
  description: DESCRIPTION,
  applicationName: "DBIM Validator",
  keywords: [
    "DBIM", "DBIM validator", "DBIM compliance", "DBIM checker", "Digital Brand Identity Manual", "DBIM v3.0",
    "Government of India website", "gov.in", "nic.in", "MeitY", "NIC", "GIGW 3.0", "Annexure F checklist",
    "website compliance", "accessibility audit", "WCAG 2.1",
  ],
  openGraph: {
    type: "website",
    siteName: "DBIM Validator",
    title: "DBIM Validator: check a gov.in website against the Digital Brand Identity Manual",
    description: DESCRIPTION,
  },
  twitter: { card: "summary", title: "DBIM Validator", description: DESCRIPTION },
};

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="var(--key)" />
      <path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${noto.variable} ${notoDeva.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to main content</a>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand" aria-label="DBIM Validator home">
              <Logo />
              <span>
                <strong>DBIM Validator</strong>
                <small>Digital Brand Identity Manual compliance checker</small>
              </span>
            </Link>
            <nav aria-label="Main">
              <Link href="/">New scan</Link>
              <Link href="/methodology">Methodology</Link>
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="container footer-inner">
            <p>
              Independent compliance checker based on the{" "}
              <a href={DBIM_SOURCE_URL} target="_blank" rel="noreferrer">Digital Brand Identity Manual v{DBIM_VERSION}</a>{" "}
              published by MeitY / NIC. Not an official Government of India service; results do not replace GIGW / STQC certification.
            </p>
            <p>
              <a href="https://dbimtoolkit.digifootprint.gov.in" target="_blank" rel="noreferrer">DBIM Toolkit</a> ·{" "}
              <a href="https://guidelines.india.gov.in" target="_blank" rel="noreferrer">GIGW 3.0</a> · <Link href="/methodology">How checks work</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
