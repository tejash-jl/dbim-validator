"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ORG_LABEL, SOURCE_LABEL, SOURCE_TITLE, fmtDate, hostOf, scoreColour } from "./ui";

type Row = { id: string; url: string; org_type: string; status: string; source?: string; progress_step: string | null; progress_pct: number; error: string | null; score: number | null; created_at: string };

export default function RecentScans({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = useCallback(() => fetch("/api/scans?limit=30").then((r) => r.json()).then((d) => setRows(d.scans)).catch(() => {}), []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    if (!rows?.some((r) => r.status === "queued" || r.status === "running")) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [rows, load]);

  if (!rows) return <p className="muted">Loading recent scans…</p>;
  if (!rows.length) return <p className="muted">No scans yet. Your scan history will appear here.</p>;
  return (
    <div className="table-wrap">
      <table className="list">
        <thead>
          <tr><th>Website</th><th>Organization type</th><th>Mode</th><th>Status</th><th>Score</th><th>Started</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/scans/${r.id}`}>{hostOf(r.url)}</Link></td>
              <td>{ORG_LABEL[r.org_type] ?? r.org_type}</td>
              <td><span className={`badge b-src-${r.source ?? "web"}`} title={SOURCE_TITLE[r.source ?? "web"]}>{SOURCE_LABEL[r.source ?? "web"]}</span></td>
              <td>
                {r.status === "done" ? <span className="badge b-done">Complete</span>
                  : r.status === "error" ? <span className="badge b-fail" title={r.error ?? ""}>Failed</span>
                  : <span className="badge b-running">{r.status === "queued" ? "Queued" : `${r.progress_pct}% · ${r.progress_step}`}</span>}
              </td>
              <td className="num">{r.score != null ? <strong style={{ color: scoreColour(r.score) === "#ffc107" ? "var(--warn)" : scoreColour(r.score) }}>{r.score}</strong> : "—"}</td>
              <td>{fmtDate(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
