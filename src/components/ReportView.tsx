"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CheckResult, ScanReport, Status } from "@/lib/dbim/types";
import { ORG_TYPES, PRIMARY_PALETTE } from "@/lib/dbim/spec";
import { ORG_LABEL, STATUS_LABEL, ScoreRing, fmtDate, hostOf, scoreColour } from "./ui";

type Scan = {
  id: string; url: string; org_type: string; status: "queued" | "running" | "done" | "error";
  progress_step: string | null; progress_pct: number; error: string | null; created_at: string; report: ScanReport | null;
};
type Previous = { id: string; created_at: string; score: number | null; statuses: Record<string, Status> } | null;

const FILTERS: { key: "all" | Status; label: string }[] = [
  { key: "all", label: "All" }, { key: "fail", label: "Failures" }, { key: "warn", label: "Warnings" },
  { key: "manual", label: "Needs review" }, { key: "pass", label: "Passed" }, { key: "na", label: "N/A" },
];
const SOURCE_LABEL = { automated: "Automated", heuristic: "Heuristic", ai: "AI-assessed", manual: "Manual" } as const;
const RANK: Record<Status, number> = { fail: 0, warn: 1, error: 2, manual: 3, pass: 4, na: 5 };

function ResultItem({ r, open }: { r: CheckResult; open: boolean }) {
  return (
    <details className={`result s-${r.status}`} open={open}>
      <summary>
        <span className={`dot d-${r.status}`} aria-hidden="true" />
        <div>
          <div className="r-title">{r.title}</div>
          <div className="r-msg">{r.message}</div>
        </div>
        <div className="r-tags">
          <span className={`badge b-${r.status}`}>{STATUS_LABEL[r.status]}</span>
          <span className="tag">§{r.section}</span>
          {r.checklist && <span className="tag">{r.checklist}</span>}
          <span className={`tag tag-${r.source}`}>{SOURCE_LABEL[r.source]}{r.confidence != null ? ` · ${Math.round(r.confidence * 100)}%` : ""}</span>
        </div>
      </summary>
      {(r.evidence.length > 0 || r.fix) && (
        <div className="r-body">
          {r.evidence.length > 0 && (
            <table className="evidence">
              <tbody>
                {r.evidence.map((e, i) => (
                  <tr key={i}>
                    <td className="k">{e.page ?? (e.selector ? "Element" : "Detail")}</td>
                    <td>
                      {e.value && <div>{e.value}</div>}
                      {e.selector && <div className="mono muted">{e.selector}</div>}
                      {e.url && <div><a href={e.url} target="_blank" rel="noreferrer" className="mono">{e.url.length > 110 ? e.url.slice(0, 110) + "…" : e.url}</a></div>}
                      {e.expected && <div className="muted">Expected: {e.expected}</div>}
                      {e.note && <div className="muted small">{e.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {r.fix && <div className="fix"><strong>How to fix:</strong> {r.fix}</div>}
        </div>
      )}
    </details>
  );
}

export default function ReportView({ id, print }: { id: string; print: boolean }) {
  const router = useRouter();
  const [scan, setScan] = useState<Scan | null>(null);
  const [previous, setPrevious] = useState<Previous>(null);
  const [notFound, setNotFound] = useState(false);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [query, setQuery] = useState("");
  const [shotPage, setShotPage] = useState(0);
  const [rescanning, setRescanning] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const load = async () => {
      const res = await fetch(`/api/scans/${id}`);
      if (res.status === 404) return setNotFound(true);
      const data = await res.json();
      if (cancelled) return;
      setScan(data.scan);
      setPrevious(data.previous);
      if (data.scan.status === "queued" || data.scan.status === "running") timer = setTimeout(load, 2000);
    };
    load().catch(() => {});
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id]);

  const report = scan?.report ?? null;
  const results = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    return report.results.filter((r) => (filter === "all" || r.status === filter) && (!q || `${r.title} ${r.message} ${r.section} ${r.checklist ?? ""}`.toLowerCase().includes(q)));
  }, [report, filter, query]);
  const byCategory = useMemo(() => {
    const m = new Map<string, CheckResult[]>();
    for (const r of results) m.set(r.category, [...(m.get(r.category) ?? []), r]);
    for (const [k, v] of m) m.set(k, v.sort((a, b) => RANK[a.status] - RANK[b.status]));
    return m;
  }, [results]);

  const diff = useMemo(() => {
    if (!report || !previous) return null;
    const improved: CheckResult[] = [], regressed: CheckResult[] = [];
    for (const r of report.results) {
      const before = previous.statuses[r.id];
      if (!before || RANK[before] > 4 || RANK[r.status] > 4 || before === r.status) continue;
      const scoreOf = (s: Status) => ({ pass: 2, warn: 1, fail: 0 } as Record<string, number>)[s];
      const a = scoreOf(before), b = scoreOf(r.status);
      if (a === undefined || b === undefined) continue;
      (b > a ? improved : regressed).push(r);
    }
    return { improved, regressed };
  }, [report, previous]);

  async function rescan() {
    setRescanning(true);
    const res = await fetch(`/api/scans/${id}/rescan`, { method: "POST" });
    const data = await res.json();
    if (res.ok) router.push(`/scans/${data.id}`);
    else setRescanning(false);
  }

  if (notFound) return <div className="container section"><h1>Scan not found</h1><p>This report does not exist or has been removed.</p></div>;
  if (!scan) return <div className="container section"><p className="muted">Loading…</p></div>;

  if (scan.status === "queued" || scan.status === "running")
    return (
      <div className="container section">
        <div className="card">
          <h1 style={{ fontSize: 24 }}>Scanning {hostOf(scan.url)}</h1>
          <p className="muted">{scan.progress_step ?? "Waiting"} — a full scan with Lighthouse usually takes 2–4 minutes.</p>
          <div className="progress" role="progressbar" aria-valuenow={scan.progress_pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(scan.progress_pct, 3)}%` }} /></div>
        </div>
      </div>
    );

  if (scan.status === "error" || !report)
    return (
      <div className="container section">
        <div className="card">
          <h1 style={{ fontSize: 24 }}>Scan failed</h1>
          <p>{hostOf(scan.url)} could not be scanned: <strong>{scan.error}</strong></p>
          <button className="btn btn-primary" onClick={rescan} disabled={rescanning}>Try again</button>
        </div>
      </div>
    );

  const page = report.pages[shotPage] ?? report.pages[0];
  const group = report.colourGroup;

  return (
    <div className="container section" data-report-ready>
      <div className="card">
        <div className="report-head">
          <div>
            <p className="muted small" style={{ margin: 0 }}>DBIM compliance report</p>
            <h1>{hostOf(scan.url)}</h1>
            {hostOf(scan.url) !== hostOf(report.url) && <p className="small muted" style={{ margin: "-4px 0 8px" }}>Redirected to {report.url}</p>}
            <div className="meta">
              <span>{ORG_LABEL[report.orgType]} · {ORG_TYPES[report.orgType].lockup}</span>
              <span>Scanned {fmtDate(report.scannedAt)}</span>
              <span>{report.pages.length} page(s) · {Math.round(report.durationMs / 1000)}s</span>
              {report.browser && <span>{report.browser}</span>}
              {group && (
                <span>
                  Colour group: <strong>{group}</strong>{" "}
                  <span className="swatches" aria-hidden="true">{PRIMARY_PALETTE[group].map((c) => <span key={c} style={{ background: c }} />)}</span>
                </span>
              )}
            </div>
            <div className="counts">
              {(["fail", "warn", "manual", "pass", "na"] as Status[]).map((s) => (
                <span key={s} className={`badge b-${s}`}>{report.counts[s]} {STATUS_LABEL[s].toLowerCase()}</span>
              ))}
            </div>
            {!print && (
              <div className="actions no-print" style={{ marginTop: 16 }}>
                <a className="btn btn-primary" href={`/api/scans/${id}/pdf`}>Download PDF</a>
                <a className="btn btn-secondary" href={`/api/scans/${id}?download=json`}>Download JSON</a>
                <button className="btn btn-secondary" onClick={rescan} disabled={rescanning}>{rescanning ? "Queuing…" : "Re-scan"}</button>
              </div>
            )}
          </div>
          <ScoreRing score={report.score} />
        </div>
      </div>

      {previous && diff && (
        <div className="card">
          <h2>Change since previous scan</h2>
          <p className="muted">
            Compared with the scan of {fmtDate(previous.created_at)} — score {previous.score ?? "?"} → <strong>{report.score}</strong>{" "}
            (<a href={`/scans/${previous.id}`}>view previous</a>).
          </p>
          <div className="diff">
            <div><strong style={{ color: "var(--pass)" }}>Improved ({diff.improved.length})</strong><ul>{diff.improved.map((r) => <li key={r.id}>{r.title}</li>)}</ul></div>
            <div><strong style={{ color: "var(--fail)" }}>Regressed ({diff.regressed.length})</strong><ul>{diff.regressed.map((r) => <li key={r.id}>{r.title}</li>)}</ul></div>
          </div>
        </div>
      )}

      <div className="section">
        <h2>Score by chapter</h2>
        <div className="cat-grid">
          {report.categoryScores.map((c) => (
            <button key={c.category} className="cat" onClick={() => document.getElementById(`cat-${c.category}`)?.scrollIntoView({ behavior: "smooth" })}>
              <div className="row"><span>{c.category}</span><span style={{ color: scoreColour(c.score) === "#ffc107" ? "var(--warn)" : scoreColour(c.score) }}>{c.pass + c.fail + c.warn ? c.score : "—"}</span></div>
              <div className="bar"><span style={{ width: `${c.score}%`, background: scoreColour(c.score) }} /></div>
              <small>{c.fail} fail · {c.warn} warning · {c.pass} pass{c.manual ? ` · ${c.manual} to review` : ""}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <h2>Checks</h2>
        {!print && (
          <div className="filters no-print" role="toolbar" aria-label="Filter checks">
            {FILTERS.map((f) => (
              <button key={f.key} className="chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}{f.key !== "all" ? ` (${report.counts[f.key as Status]})` : ""}
              </button>
            ))}
            <input type="search" placeholder="Search checks…" aria-label="Search checks" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        )}
        {[...byCategory.entries()].map(([cat, rs]) => (
          <div key={cat} id={`cat-${cat}`}>
            <div className="cat-title"><h3>{cat}</h3><span className="muted small">{rs.length} check(s)</span></div>
            {rs.map((r) => <ResultItem key={r.id} r={r} open={print ? r.status === "fail" || r.status === "warn" : false} />)}
          </div>
        ))}
        {!results.length && <p className="muted">No checks match this filter.</p>}
      </div>

      {report.lighthouse && (
        <div className="section">
          <h2>Lighthouse ({report.lighthouse.formFactor})</h2>
          <div className="cat-grid">
            {([["Performance", report.lighthouse.performance], ["Accessibility", report.lighthouse.accessibility], ["Best practices", report.lighthouse.bestPractices], ["SEO", report.lighthouse.seo]] as const).map(([k, v]) => (
              <div key={k} className="cat" style={{ cursor: "default" }}>
                <div className="row"><span>{k}</span><span>{v ?? "—"}</span></div>
                <div className="bar"><span style={{ width: `${v ?? 0}%`, background: scoreColour(v ?? 0) }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <h2>Scanned pages</h2>
        {report.pages.length > 1 && (
          <div className="tabs no-print" role="group" aria-label="Choose page">
            {report.pages.map((p, i) => (
              <button key={p.url} className="chip" aria-pressed={i === shotPage} onClick={() => setShotPage(i)}>
                {(() => { try { const u = new URL(p.url); return u.pathname === "/" ? "Homepage" : decodeURIComponent(u.pathname); } catch { return p.url; } })()}
              </button>
            ))}
          </div>
        )}
        <p className="small muted"><a href={page.url} target="_blank" rel="noreferrer">{page.url}</a> — HTTP {page.status} — {page.title}</p>
        <div className="shots">
          <div>
            <div className="small muted">Desktop · 1440px</div>
            {/* eslint-disable-next-line @next/next/no-img-element -- screenshots are served from the scan store */}
            <div className="shot">{page.screenshotDesktop && <img src={`/api/scans/${id}/files/${page.screenshotDesktop}`} alt={`Desktop screenshot of ${page.url}`} loading="lazy" />}</div>
          </div>
          <div>
            <div className="small muted">Mobile · 390px</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="shot">{page.screenshotMobile && <img src={`/api/scans/${id}/files/${page.screenshotMobile}`} alt={`Mobile screenshot of ${page.url}`} loading="lazy" />}</div>
          </div>
        </div>
      </div>

      {report.notes.length > 0 && (
        <div className="section">
          <h2>Scan notes</h2>
          <ul className="small muted">{report.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
      <p className="small muted section">
        Automated checks measure what can be observed in a browser; heuristic checks infer intent from text and structure; AI-assessed checks
        are judgements made by Claude from screenshots and page text; manual items must be verified by the website team. A high score does
        not certify GIGW/STQC compliance.
      </p>
    </div>
  );
}
