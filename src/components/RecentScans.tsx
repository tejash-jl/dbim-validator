"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MiniRing, ORG_LABEL, SOURCE_LABEL, SOURCE_TITLE, fmtDate, hostOf } from "./ui";

type Row = {
  id: string; url: string; org_type: string; status: string; source?: string; progress_step: string | null; progress_pct: number;
  error: string | null; score: number | null; created_at: string; fails?: number | null; warns?: number | null;
};
type Mode = "all" | "web" | "cli";

export default function RecentScans({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mode, setMode] = useState<Mode>("all");
  const load = useCallback(() => fetch("/api/scans?limit=30").then((r) => r.json()).then((d) => setRows(d.scans)).catch(() => {}), []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    if (!rows?.some((r) => r.status === "queued" || r.status === "running")) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [rows, load]);

  const shown = (rows ?? []).filter((r) => mode === "all" || (r.source ?? "web") === mode);
  return (
    <>
      <div className="section-head">
        <h2 id="recent-h">Recent scans</h2>
        <div className="segmented" role="group" aria-label="Show scans started from">
          {(["all", "web", "cli"] as Mode[]).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "all" ? "All" : SOURCE_LABEL[m]}</button>
          ))}
        </div>
      </div>
      {!rows ? (
        <p className="muted">Loading recent scans…</p>
      ) : !shown.length ? (
        <p className="muted">{rows.length ? "No scans from this mode yet." : "No scans yet. Your scan history will appear here."}</p>
      ) : (
        <div className="scan-grid">
          {shown.map((r) => {
            const src = r.source ?? "web";
            const running = r.status === "queued" || r.status === "running";
            return (
              <Link key={r.id} href={`/scans/${r.id}`} className="scan-tile"
                aria-label={`${hostOf(r.url)}, ${r.status === "done" ? `score ${r.score}` : running ? "scanning" : "failed"}`}>
                <MiniRing score={r.status === "done" ? r.score : null} label={running ? `${r.progress_pct}%` : r.status === "error" ? "Failed" : "—"} />
                <span className="body">
                  <span className="host">{hostOf(r.url)}</span>
                  <span className="meta-line">{ORG_LABEL[r.org_type] ?? r.org_type} · {fmtDate(r.created_at)}</span>
                  <span className="badges">
                    <span className={`badge b-src-${src}`} title={SOURCE_TITLE[src]}>{SOURCE_LABEL[src]}</span>
                    {r.status === "done" && (
                      <>
                        {r.fails != null && <span className="badge b-fail">{r.fails} fail</span>}
                        {r.warns != null && <span className="badge b-warn">{r.warns} warn</span>}
                      </>
                    )}
                    {running && <span className="badge b-running">{r.status === "queued" ? "Queued" : r.progress_step}</span>}
                    {r.status === "error" && <span className="badge b-fail" title={r.error ?? ""}>Scan failed</span>}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
