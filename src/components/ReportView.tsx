"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CheckResult, ReportPage, ScanReport, Status } from "@/lib/dbim/types";
import { ORG_TYPES, PRIMARY_PALETTE } from "@/lib/dbim/spec";
import { Icon, Mark, ORG_LABEL, SOURCE_LABEL as MODE_LABEL, SOURCE_TITLE, STATUS_LABEL, ScoreRing, fmtDate, hostOf, scoreColour, skippedStages } from "./ui";

type Scan = {
  id: string; url: string; org_type: string; status: "queued" | "running" | "done" | "error";
  progress_step: string | null; progress_pct: number; error: string | null; created_at: string; report: ScanReport | null;
  source?: "web" | "cli"; options?: Partial<ScanReport["options"]>;
};
type Previous = { id: string; created_at: string; score: number | null; statuses: Record<string, Status> } | null;

const FILTERS: { key: "all" | Status; label: string }[] = [
  { key: "all", label: "All" }, { key: "fail", label: "Fail" }, { key: "warn", label: "Warning" },
  { key: "manual", label: "Review" }, { key: "pass", label: "Pass" }, { key: "na", label: "N/A" },
];
const SEVERITY_RANK = { critical: 0, major: 1, minor: 2 } as const;

/** Scan stages in the order run.ts reports them, with the progress percentage each one starts at. */
const STAGES = [
  { title: "Open the homepage", detail: "Desktop 1440px and mobile 390px", from: 1 },
  { title: "Scan key pages", detail: "Pages from the menu and footer: styles, images, accessibility (axe-core)", from: 10 },
  { title: "Check links and PDFs, AI review", detail: "Broken links, tagged PDFs, and Claude's visual and writing review", from: 60, skip: (o: Partial<ScanReport["options"]>) => o.checkLinks === false && o.checkPdfs === false && o.ai === false },
  { title: "Lighthouse and Core Web Vitals", detail: "Performance, accessibility, best practices, SEO", from: 80, skip: (o: Partial<ScanReport["options"]>) => o.lighthouse === false },
  { title: "Score against every check", detail: "Report with evidence and fixes", from: 95 },
];
const SOURCE_LABEL = { automated: "Automated", heuristic: "Heuristic", ai: "AI-assessed", manual: "Manual" } as const;
const RANK: Record<Status, number> = { fail: 0, warn: 1, error: 2, manual: 3, pass: 4, na: 5 };

/** Screenshot file names for a page. Reports from before these were stored fall back to the scanner's naming. */
function shotsOf(p: ReportPage) {
  const derive = (suffix: string) => p.screenshotDesktop?.replace(/-desktop\.jpg$/, `-${suffix}.jpg`);
  return {
    desktop: p.screenshotDesktop,
    mobile: p.screenshotMobile,
    fold: p.screenshotFold ?? derive("fold"),
    header: p.screenshotHeader ?? derive("header"),
    footer: p.screenshotFooter ?? derive("footer"),
  };
}

type ShotRef = { file: string; alt: string; caption: string };

/** Which homepage crop illustrates a check, if any. */
function shotForCheck(id: string): "header" | "footer" | null {
  if (/^(header|logo)\./.test(id) || ["ai.logo_lockup", "ai.emblem_integrity", "ai.header_layout", "manual.emblem-source"].includes(id)) return "header";
  if (/^footer\./.test(id) || id === "colours.footer") return "footer";
  return null;
}

function Shot({ scanId, file, alt, print, className }: { scanId: string; file?: string; alt: string; print: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!file || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- screenshots are served from the scan store
    <img
      className={className}
      src={`/api/scans/${scanId}/files/${file}`}
      alt={alt}
      loading={print ? "eager" : "lazy"}
      onError={() => setFailed(true)}
    />
  );
}

function ResultItem({ r, open, scanId, shot, print }: { r: CheckResult; open: boolean; scanId: string; shot: ShotRef | null; print: boolean }) {
  const hasBody = r.evidence.length > 0 || r.fix || shot;
  return (
    <details className="result" id={`check-${r.id}`} open={open}>
      <summary>
        <span className={`badge status b-${r.status}`}>{STATUS_LABEL[r.status]}</span>
        <span className="r-text">
          <span className="r-title">{r.title}</span>
          <span className="r-msg">{r.message}</span>
        </span>
        <span className="r-tags">
          <span className="tag tag-mono">§{r.section}{r.checklist ? ` · ${r.checklist}` : ""}</span>
          <span className="tag">{SOURCE_LABEL[r.source]}{r.confidence != null ? ` · ${Math.round(r.confidence * 100)}%` : ""}</span>
          {hasBody && !print && <span className="chev"><Icon name="chevron" size={20} /></span>}
        </span>
      </summary>
      {hasBody && (
        <div className="r-body">
          {(r.evidence.length > 0 || r.fix) && <div>
            {r.evidence.length > 0 && (
              <>
                <p className="label">Evidence</p>
                <div className="evidence-list">
                  {r.evidence.map((e, i) => (
                    <div key={i} className="evidence-item">
                      {(e.page || e.selector) && <span className="k">{e.page ?? "Element"}</span>}
                      {e.value && <span>{e.value}</span>}
                      {e.selector && <div className="mono muted">{e.selector}</div>}
                      {e.url && <div><a href={e.url} target="_blank" rel="noreferrer" className="mono">{e.url.length > 110 ? e.url.slice(0, 110) + "…" : e.url}</a></div>}
                      {e.expected && <div className="muted">Expected: {e.expected}</div>}
                      {e.note && <div className="muted small">{e.note}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
            {r.fix && <div className="fix"><strong>How to fix:</strong> {r.fix}</div>}
          </div>}
          {shot && (
            <figure className="evidence-shot">
              <p className="label">{shot.caption}</p>
              <Shot scanId={scanId} file={shot.file} alt={shot.alt} print={print} />
            </figure>
          )}
        </div>
      )}
    </details>
  );
}

function Progress({ scan }: { scan: Scan }) {
  const opts = scan.options ?? {};
  const pct = scan.status === "queued" ? 0 : scan.progress_pct;
  const current = scan.status === "queued" ? -1 : STAGES.findLastIndex((st) => pct >= st.from);
  const skipped = skippedStages(opts);
  return (
    <div className="progress-page">
      <div className="container progress-layout">
        <section className="panel progress-main" aria-live="polite">
          <div className="progress-head">
            <div>
              <p className="muted" style={{ margin: "0 0 6px", fontSize: 14 }}>
                Scanning · {ORG_LABEL[scan.org_type] ?? scan.org_type} ·{" "}
                <span className={`badge b-src-${scan.source ?? "web"}`} title={SOURCE_TITLE[scan.source ?? "web"]}>{MODE_LABEL[scan.source ?? "web"]}</span>
              </p>
              <h1>{hostOf(scan.url)}</h1>
            </div>
            <div className="progress-pct"><strong>{pct}%</strong><span className="small muted">{scan.status === "queued" ? "waiting in queue" : scan.progress_step}</span></div>
          </div>
          <div className="progress" role="progressbar" aria-label="Scan progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(pct, 2)}%` }} /></div>
          <ol className="timeline">
            {STAGES.map((st, i) => {
              const isSkipped = st.skip?.(opts) ?? false;
              const state = isSkipped ? "skipped" : i < current ? "done" : i === current ? "active" : "todo";
              return (
                <li key={st.title} className={state}>
                  <span className="rail">
                    <span className="dot">{state === "done" && <Icon name="check" size={16} strokeWidth={3} />}</span>
                    {i < STAGES.length - 1 && <span className="line" />}
                  </span>
                  <span className="step">
                    <strong>{st.title}{isSkipped ? " (skipped)" : ""}</strong>
                    <span>{st.detail}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="small muted" style={{ margin: 0, display: "flex", gap: 8, alignItems: "center" }}>
            <Icon name="info" size={18} />
            {scan.source === "cli" ? "Running from the command line (npm run scan); this page updates live." : "You can leave this page; the report keeps building and appears in Recent scans."}
          </p>
        </section>
        <aside className="progress-side">
          <div className="panel">
            <h2>This scan</h2>
            <p className="found"><span>Organization type</span><strong>{ORG_LABEL[scan.org_type] ?? scan.org_type}</strong></p>
            <p className="found"><span>Pages</span><strong>Up to {opts.maxPages ?? 6}</strong></p>
            <p className="found"><span>Started</span><strong>{fmtDate(scan.created_at)}</strong></p>
            {skipped.length > 0 && <p className="found"><span>Skipped</span><strong>{skipped.join(", ")}</strong></p>}
          </div>
          <div className="panel">
            <h2>Typical time</h2>
            <p className="small muted" style={{ margin: 0 }}>A full scan with Lighthouse and AI review usually takes 3–5 minutes. Screenshots and results appear when it finishes.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function ReportView({ id, print }: { id: string; print: boolean }) {
  const router = useRouter();
  const [scan, setScan] = useState<Scan | null>(null);
  const [previous, setPrevious] = useState<Previous>(null);
  const [notFound, setNotFound] = useState(false);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [source, setSource] = useState<"all" | CheckResult["source"]>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
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
    return report.results.filter((r) => (filter === "all" || r.status === filter) && (source === "all" || r.source === source)
      && (!q || `${r.title} ${r.message} ${r.section} ${r.checklist ?? ""}`.toLowerCase().includes(q)));
  }, [report, filter, source, query]);
  const byCategory = useMemo(() => {
    const m = new Map<string, CheckResult[]>();
    for (const r of results) m.set(r.category, [...(m.get(r.category) ?? []), r]);
    for (const [k, v] of m) m.set(k, v.sort((a, b) => RANK[a.status] - RANK[b.status]));
    return m;
  }, [results]);
  const topFixes = useMemo(
    () => (report?.results ?? [])
      .filter((r) => r.status === "fail" || r.status === "warn")
      .sort((a, b) => RANK[a.status] - RANK[b.status] || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
      .slice(0, 5),
    [report],
  );

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

  function jumpTo(checkId: string) {
    setFilter("all");
    setSource("all");
    setQuery("");
    setOpenId(checkId);
    requestAnimationFrame(() => document.getElementById(`check-${checkId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  if (notFound) return <div className="container section"><h1>Scan not found</h1><p>This report does not exist or has been removed.</p></div>;
  if (!scan) return <div className="container section"><p className="muted">Loading…</p></div>;
  if (scan.status === "queued" || scan.status === "running") return <Progress scan={scan} />;

  if (scan.status === "error" || !report)
    return (
      <div className="progress-page">
        <div className="container">
          <div className="panel" style={{ maxWidth: 760 }}>
            <h1>Scan failed</h1>
            <p style={{ margin: 0 }}><span className="mono">{hostOf(scan.url)}</span> could not be scanned:</p>
            <div className="alert alert-error">{scan.error}</div>
            <div><button className="btn btn-primary" onClick={rescan} disabled={rescanning}>{rescanning ? "Queuing…" : "Try again"}</button></div>
          </div>
        </div>
      </div>
    );

  const page = report.pages[shotPage] ?? report.pages[0];
  const homeShots = shotsOf(report.pages[0]);
  const group = report.colourGroup;
  const mode = scan.source ?? "web";
  const skipped = skippedStages(scan.options ?? report.options);
  const pathLabel = (u: string) => {
    try {
      const x = new URL(u);
      return x.pathname === "/" ? "Homepage" : decodeURIComponent(x.pathname);
    } catch {
      return u;
    }
  };
  const onDark = !print;

  return (
    <div data-report-ready>
      {print && (
        <div className="container print-brand">
          <Mark size={28} />
          <strong>DBIM Validator</strong>
          <span>Digital Brand Identity Manual v3.0 compliance report · independent tool, not an official certification</span>
        </div>
      )}
      <section className="report-band">
        <div className="container report-band-inner">
          <ScoreRing score={report.score} onDark={onDark} />
          <div className="summary">
            <p className="kicker">DBIM compliance report</p>
            <h1>{hostOf(scan.url)}</h1>
            {hostOf(scan.url) !== hostOf(report.url) && <p className="kicker" style={{ marginTop: -4 }}>Redirected to {report.url}</p>}
            <div className="meta">
              <span>{ORG_LABEL[report.orgType]} · {ORG_TYPES[report.orgType].lockup}</span>
              {group && (
                <span>
                  Colour group <strong>{group}</strong>{" "}
                  <span className="swatches" aria-hidden="true">{PRIMARY_PALETTE[group].slice(1, 4).map((c) => <span key={c} style={{ background: c }} />)}</span>
                </span>
              )}
              <span>{report.pages.length} page{report.pages.length > 1 ? "s" : ""} · {Math.round(report.durationMs / 1000)}s</span>
              {report.browser && <span>{report.browser}</span>}
              <span>{fmtDate(report.scannedAt)}</span>
              <span className={`badge b-src-${mode}`} title={SOURCE_TITLE[mode]}>{mode === "cli" ? "CLI" : "Web"}</span>
              {skipped.length > 0 && <span>Skipped: {skipped.join(", ")}</span>}
            </div>
            <div className="counts">
              {(["fail", "warn", "manual", "pass", "na"] as Status[]).map((s) => (
                <span key={s} className={`badge b-${s}`}>{report.counts[s]} {STATUS_LABEL[s].toLowerCase()}</span>
              ))}
            </div>
          </div>
          {!print && (
            <div className="report-actions no-print">
              <a className="btn btn-on-dark" href={`/api/scans/${id}/pdf`}><Icon name="download" size={18} strokeWidth={2.2} />Download PDF</a>
              <div className="row">
                <a className="btn btn-ghost-dark" href={`/api/scans/${id}/pdf?inline=1`} target="_blank" rel="noreferrer">Preview</a>
                <a className="btn btn-ghost-dark" href={`/api/scans/${id}?download=json`}>JSON</a>
                <button className="btn btn-ghost-dark" onClick={rescan} disabled={rescanning}>{rescanning ? "Queuing…" : "Re-scan"}</button>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="report-body">
        <div className="container">
          <div className="overview">
            <section className="panel" aria-labelledby="chapters-h">
              <h2 id="chapters-h">Score by chapter</h2>
              <ul className="chapter-bars">
                {report.categoryScores.map((c) => {
                  const scored = c.pass + c.fail + c.warn > 0;
                  return (
                    <li key={c.category}>
                      <button type="button" onClick={() => document.getElementById(`cat-${c.category}`)?.scrollIntoView({ behavior: "smooth" })}
                        title={`${c.fail} fail · ${c.warn} warning · ${c.pass} pass${c.manual ? ` · ${c.manual} to review` : ""}`}>
                        <span className="name">{c.category}</span>
                        <span className="bar"><span style={{ width: scored ? `${Math.max(c.score, 2)}%` : 0, background: scoreColour(c.score) }} /></span>
                        <span className="val">{scored ? c.score : "—"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="panel" aria-labelledby="fixes-h">
              <h2 id="fixes-h">Fix these first</h2>
              {topFixes.length ? (
                <ol className="top-fixes">
                  {topFixes.map((r) => (
                    <li key={r.id}>
                      <span>
                        <a href={`#check-${r.id}`} onClick={(e) => { e.preventDefault(); jumpTo(r.id); }}>{r.title}</a>
                        <small>{r.category} · §{r.section} · {r.severity}{r.status === "warn" ? " · warning" : ""}</small>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : <p className="muted" style={{ margin: 0 }}>Nothing failed. Review the manual checks below.</p>}
            </section>

            <section className="panel preview" aria-labelledby="preview-h">
              <h2 id="preview-h">Homepage preview</h2>
              <div className="preview-shots">
                <figure>
                  <Shot scanId={id} file={homeShots.fold ?? homeShots.desktop} alt={`Desktop view of ${report.pages[0].url}`} print={print} className="crop" />
                  <figcaption>Desktop · 1440px</figcaption>
                </figure>
                <figure>
                  <Shot scanId={id} file={homeShots.mobile} alt={`Mobile view of ${report.pages[0].url}`} print={print} className="crop" />
                  <figcaption>Mobile · 390px</figcaption>
                </figure>
              </div>
              {previous && diff && (
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                  <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 16 }}>Since the previous scan</p>
                  <p className="diff-line">
                    <span className="up">▲ {diff.improved.length} improved</span>
                    <span className="down">▼ {diff.regressed.length} regressed</span>
                    <span className="muted">· score {previous.score ?? "?"} → {report.score} · <a href={`/scans/${previous.id}`}>previous report</a></span>
                  </p>
                  {(diff.improved.length > 0 || diff.regressed.length > 0) && (
                    <details className="small" style={{ marginTop: 6 }}>
                      <summary style={{ cursor: "pointer", color: "var(--blue-2)", fontWeight: 600 }}>Show changes</summary>
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {diff.improved.map((r) => <li key={r.id}><span className="up">▲</span> {r.title}</li>)}
                        {diff.regressed.map((r) => <li key={r.id}><span className="down">▼</span> {r.title}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </section>
          </div>

          <section className="panel" aria-labelledby="checks-h">
            <div className="checks-head">
              <h2 id="checks-h">All checks</h2>
              {!print && (
                <label className="search-box no-print">
                  <Icon name="search" size={18} />
                  <span className="visually-hidden">Search checks</span>
                  <input type="search" placeholder="Search checks, sections, checklist items" value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
              )}
            </div>
            {!print && (
              <div className="filters no-print" role="group" aria-label="Filter checks">
                {FILTERS.map((f) => (
                  <button key={f.key} type="button" className="chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                    {f.label} {f.key === "all" ? report.results.length : report.counts[f.key as Status]}
                  </button>
                ))}
                <span className="sep" aria-hidden="true" />
                <label className="visually-hidden" htmlFor="type-filter">Check type</label>
                <select id="type-filter" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
                  <option value="all">Type: all</option>
                  {(Object.keys(SOURCE_LABEL) as CheckResult["source"][]).map((k) => <option key={k} value={k}>{SOURCE_LABEL[k]}</option>)}
                </select>
              </div>
            )}
            {[...byCategory.entries()].map(([cat, rs]) => {
              const all = report.results.filter((r) => r.category === cat);
              return (
                <div key={cat}>
                  <div className="cat-title" id={`cat-${cat}`}>
                    <h3>{cat}</h3>
                    <span>{all.filter((r) => r.status === "fail").length} fail · {all.filter((r) => r.status === "warn").length} warning · {rs.length} shown of {all.length}</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {rs.map((r) => {
                      const kind = shotForCheck(r.id);
                      const file = kind ? homeShots[kind] : undefined;
                      const shot = kind && file ? { file, alt: `Homepage ${kind} screenshot`, caption: `Homepage ${kind}, as scanned` } : null;
                      return <ResultItem key={r.id} r={r} scanId={id} shot={shot} print={print} open={print ? r.status === "fail" || r.status === "warn" : openId === r.id} />;
                    })}
                  </div>
                </div>
              );
            })}
            {!results.length && <p className="muted" style={{ margin: 0 }}>No checks match these filters.</p>}
          </section>

          {report.lighthouse && (
            <section className="panel" aria-labelledby="lh-h">
              <h2 id="lh-h">Lighthouse <span className="muted" style={{ fontWeight: 500, fontSize: 14 }}>({report.lighthouse.formFactor})</span></h2>
              <div className="lh-grid">
                {([["Performance", report.lighthouse.performance], ["Accessibility", report.lighthouse.accessibility], ["Best practices", report.lighthouse.bestPractices], ["SEO", report.lighthouse.seo]] as const).map(([k, v]) => (
                  <div key={k} className="lh">
                    <div className="row"><span>{k}</span><span>{v ?? "—"}</span></div>
                    <div className="bar"><span style={{ width: `${v ?? 0}%`, background: scoreColour(v ?? 0) }} /></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel" aria-labelledby="pages-h">
            <h2 id="pages-h">Scanned pages</h2>
            {print ? (
              report.pages.map((p) => {
                const sh = shotsOf(p);
                return (
                  <div key={p.url} className="print-page">
                    <h3>{pathLabel(p.url)}</h3>
                    <p className="small muted">{p.url} — HTTP {p.status} — {p.title}</p>
                    <div className="preview-shots">
                      <figure>
                        <Shot scanId={id} file={sh.fold ?? sh.desktop} alt={`Desktop view of ${p.url}`} print className="crop" />
                        <figcaption>Desktop · 1440px</figcaption>
                      </figure>
                      <figure>
                        <Shot scanId={id} file={sh.mobile} alt={`Mobile view of ${p.url}`} print className="crop" />
                        <figcaption>Mobile · 390px</figcaption>
                      </figure>
                    </div>
                  </div>
                );
              })
            ) : (
              <>
                {report.pages.length > 1 && (
                  <div className="page-tabs" role="group" aria-label="Choose page">
                    {report.pages.map((p, i) => (
                      <button key={p.url} type="button" className="chip" aria-pressed={i === shotPage} onClick={() => setShotPage(i)}>{pathLabel(p.url)}</button>
                    ))}
                  </div>
                )}
                <p className="small muted" style={{ margin: 0 }}><a href={page.url} target="_blank" rel="noreferrer">{page.url}</a> — HTTP {page.status} — {page.title}</p>
                <div className="shots">
                  <div>
                    <p className="small muted" style={{ margin: "0 0 4px" }}>Desktop · 1440px (full page)</p>
                    <div className="shot"><Shot key={`d-${shotPage}`} scanId={id} file={page.screenshotDesktop} alt={`Desktop screenshot of ${page.url}`} print={false} /></div>
                  </div>
                  <div>
                    <p className="small muted" style={{ margin: "0 0 4px" }}>Mobile · 390px (full page)</p>
                    <div className="shot"><Shot key={`m-${shotPage}`} scanId={id} file={page.screenshotMobile} alt={`Mobile screenshot of ${page.url}`} print={false} /></div>
                  </div>
                </div>
              </>
            )}
          </section>

          {report.notes.length > 0 && (
            <section className="panel" aria-labelledby="notes-h">
              <h2 id="notes-h">Scan notes</h2>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{report.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </section>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            Automated checks measure what can be observed in a browser; heuristic checks infer intent from text and structure; AI-assessed checks
            are judgements made by Claude from screenshots and page text; manual items must be verified by the website team. A high score does
            not certify GIGW/STQC compliance.
          </p>
        </div>
      </div>
    </div>
  );
}
