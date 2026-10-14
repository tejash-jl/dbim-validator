"use client";

import { useState } from "react";
import ScanForm from "./ScanForm";
import RecentScans from "./RecentScans";

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Validate a website against the Digital Brand Identity Manual</h1>
          <p className="lead">
            Checks colours, typography, icons, logo lockup, header and footer, imagery, content, search, performance and accessibility
            against DBIM v3.0 and its Annexure F compliance checklists — with evidence and fixes for every item.
          </p>
          <ScanForm onQueued={() => setRefreshKey((k) => k + 1)} />
        </div>
      </section>
      <section className="container section">
        <h2>Recent scans</h2>
        <RecentScans refreshKey={refreshKey} />
      </section>
    </>
  );
}
