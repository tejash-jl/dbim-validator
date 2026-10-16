"use client";

import Link from "next/link";
import { useState } from "react";
import ScanForm from "./ScanForm";
import RecentScans from "./RecentScans";
import { Icon } from "./ui";

export type ServerCaps = { localUrls: boolean; headed: boolean; browser: "chrome" | "msedge" | "chromium" };
export type Chapter = { name: string; count: number; section: string };

const BROWSER_LABEL = { chrome: "Google Chrome", msedge: "Microsoft Edge", chromium: "Chromium" } as const;

export default function Home({ caps, chapters, totalChecks }: { caps: ServerCaps; chapters: Chapter[]; totalChecks: number }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="pill">
              <span className="pill-swatch" aria-hidden="true">
                {["#214AAB", "#5279D7", "#A3BBF3", "#D2DFFF"].map((c) => <span key={c} style={{ background: c }} />)}
              </span>
              DBIM v3.0 · {totalChecks} checks · Annexure F
            </span>
            <h1>Is your government website DBIM compliant?</h1>
            <p className="lead">
              Paste a gov.in or nic.in address. We open it in {BROWSER_LABEL[caps.browser]}, scan the homepage and key pages, and score them
              against the Digital Brand Identity Manual, with evidence and a fix for every check.
            </p>
            <ul className="hero-points">
              <li><Icon name="checkCircle" size={20} />Every result cites its DBIM section and checklist item</li>
              {caps.localUrls && <li><Icon name="monitor" size={20} />Works on sites still running on your machine (localhost)</li>}
              <li><Icon name="star" size={20} />Accessibility, Lighthouse and AI review in one report</li>
            </ul>
          </div>
          <ScanForm caps={caps} onQueued={() => setRefreshKey((k) => k + 1)} />
        </div>
      </section>

      <section className="container home-section" aria-labelledby="chapters-h">
        <div className="section-head">
          <div>
            <p className="eyebrow">What we check</p>
            <h2 id="chapters-h">Every chapter of the manual</h2>
          </div>
          <Link href="/methodology">See all {totalChecks} checks →</Link>
        </div>
        <div className="tile-grid">
          {chapters.map((c) => (
            <Link key={c.name} href={`/methodology#${encodeURIComponent(c.name)}`} className="tile">
              <span className="tile-icon"><Icon name={c.name} /></span>
              <span>
                <strong>{c.name}</strong>
                <span className="sub">{c.count} checks · {c.section}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container home-section" aria-labelledby="recent-h">
        <RecentScans refreshKey={refreshKey} />
      </section>
    </>
  );
}
