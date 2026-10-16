import type { Metadata } from "next";
import Link from "next/link";
import { Noto_Sans, Noto_Sans_Devanagari, Noto_Sans_Mono } from "next/font/google";
import { DBIM_SOURCE_URL, DBIM_VERSION } from "@/lib/dbim/spec";
import { Icon, Mark } from "@/components/ui";
import NavLinks from "@/components/NavLinks";
import "./globals.css";

const noto = Noto_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-noto" });
const notoMono = Noto_Sans_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-noto-mono" });
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${noto.variable} ${notoDeva.variable} ${notoMono.variable}`}>
      <body>
        <div className="utility-bar no-print">
          <div className="container utility-inner">
            <a href="#main" className="skip-link">Skip to main content</a>
            <span className="note">Independent open-source tool · not a Government of India service</span>
          </div>
        </div>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand" aria-label="DBIM Validator home">
              <Mark size={40} />
              <span>
                <strong>DBIM Validator</strong>
                <small>Digital Brand Identity Manual compliance checker</small>
              </span>
            </Link>
            <NavLinks github={<Icon name="github" size={18} />} />
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="container footer-inner">
            <div className="about">
              <strong>DBIM Validator</strong>
              An independent open-source project based on the{" "}
              <a href={DBIM_SOURCE_URL} target="_blank" rel="noreferrer">Digital Brand Identity Manual v{DBIM_VERSION}</a> published by MeitY and NIC. Not
              affiliated with or endorsed by MeitY, NIC or the Government of India. A high score does not certify a website or replace GIGW / STQC review.
            </div>
            <nav aria-label="Footer">
              <Link href="/methodology">Methodology</Link>
              <a href="https://dbimtoolkit.digifootprint.gov.in" target="_blank" rel="noreferrer">DBIM Toolkit</a>
              <a href="https://github.com/tejash-jl/dbim-validator/issues/new?template=false-positive.yml" target="_blank" rel="noreferrer">Report a false positive</a>
              <a href="https://github.com/tejash-jl/dbim-validator" target="_blank" rel="noreferrer">Source on GitHub · MIT</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
