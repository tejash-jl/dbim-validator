"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ORG_TYPES, type OrgType } from "@/lib/dbim/spec";
import type { ServerCaps } from "./Home";

const BROWSER_LABEL = { chrome: "Google Chrome", msedge: "Microsoft Edge", chromium: "Chromium" } as const;

export default function ScanForm({ caps, onQueued }: { caps: ServerCaps; onQueued?: () => void }) {
  const router = useRouter();
  const [urls, setUrls] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("ministry");
  const [maxPages, setMaxPages] = useState(6);
  const [lighthouse, setLighthouse] = useState(true);
  const [checkLinks, setCheckLinks] = useState(true);
  const [checkPdfs, setCheckPdfs] = useState(true);
  const [ai, setAi] = useState(true);
  // Watching the browser is on by default when running locally; the choice is remembered per browser.
  const [headed, setHeaded] = useState(caps.headed);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("dbim.showBrowser");
      if (saved !== null) setHeaded(saved === "1");
    } catch {}
  }, []);
  const toggleHeaded = (on: boolean) => {
    setHeaded(on);
    try {
      localStorage.setItem("dbim.showBrowser", on ? "1" : "0");
    } catch {}
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const list = urls.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!list.length) return setError("Enter at least one website URL.");
    if (list.length > 20) return setError("You can scan up to 20 URLs at a time.");
    setBusy(true);
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: list, orgType, maxPages, lighthouse, checkLinks, checkPdfs, ai, headed: caps.headed && headed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start the scan");
      const skipped = (data.errors ?? []).map((x: { url: string; error: string }) => `${x.url}: ${x.error}`);
      if (data.ids.length === 1 && !skipped.length) {
        router.push(`/scans/${data.ids[0]}`);
        return;
      }
      setInfo(`${data.ids.length} scan(s) queued.${skipped.length ? ` Skipped — ${skipped.join("; ")}` : ""}`);
      setUrls("");
      onQueued?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={submit} aria-describedby="form-intro">
      <p id="form-intro" className="muted" style={{ margin: 0 }}>
        Enter one or more website addresses and choose the organization type. Fields marked * are required.
      </p>
      <div>
        <label className="field-label" htmlFor="urls">Website URL(s) *</label>
        <textarea id="urls" required value={urls} onChange={(e) => { setUrls(e.target.value); setError(null); }} placeholder={caps.localUrls ? "https://www.meity.gov.in\nlocalhost:3000" : "https://www.meity.gov.in\nhttps://www.example.gov.in"} spellCheck={false} />
        <div className="hint">
          One URL per line, up to 20. Each URL is scanned separately.
          {caps.localUrls && " Sites running on your machine or local network (localhost, 127.0.0.1, 192.168.x.x) can be scanned too."}
        </div>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">Organization type * <span className="hint">(decides the logo lockup, header and checklists — DBIM §5.2)</span></legend>
        <div className="org-options">
          {(Object.keys(ORG_TYPES) as OrgType[]).map((k) => (
            <label key={k} className={`org-option ${orgType === k ? "selected" : ""}`}>
              <input type="radio" name="orgType" value={k} checked={orgType === k} onChange={() => setOrgType(k)} />
              <div>
                <strong>{ORG_TYPES[k].label}</strong>
                <span>{ORG_TYPES[k].lockup} · {ORG_TYPES[k].header}{k === "ministry" ? " · includes Annexure F.2 checklist" : ""}</span>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      <details className="advanced">
        <summary>Scan options</summary>
        <div className="options-row">
          <label className="inline-number">
            Pages to scan
            <input type="number" min={1} max={15} value={maxPages} onChange={(e) => setMaxPages(Math.max(1, Math.min(15, Number(e.target.value) || 1)))} />
          </label>
          <label className="check"><input type="checkbox" checked={lighthouse} onChange={(e) => setLighthouse(e.target.checked)} /> Lighthouse performance</label>
          <label className="check"><input type="checkbox" checked={checkLinks} onChange={(e) => setCheckLinks(e.target.checked)} /> Check links</label>
          <label className="check"><input type="checkbox" checked={checkPdfs} onChange={(e) => setCheckPdfs(e.target.checked)} /> Check PDFs</label>
          <label className="check"><input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /> AI visual &amp; content review</label>
        </div>
        <div className="hint">The homepage plus up to {maxPages - 1} inner page(s) from the navigation and footer are scanned in {BROWSER_LABEL[caps.browser]} at desktop (1440px) and mobile (390px) widths.</div>
      </details>

      <div className="actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !list.length}>
          {busy ? "Starting…" : list.length > 1 ? `Validate ${list.length} websites` : "Validate website"}
        </button>
        {caps.headed && (
          <label className="check">
            <input type="checkbox" checked={headed} onChange={(e) => toggleHeaded(e.target.checked)} /> Show the browser while scanning
          </label>
        )}
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {info && <div className="alert alert-info" role="status">{info}</div>}
    </form>
  );
}
