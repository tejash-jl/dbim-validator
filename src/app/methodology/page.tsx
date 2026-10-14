import { ALL_RULES, CATEGORY_ORDER } from "@/lib/dbim/engine";
import { DBIM_SOURCE_URL, DBIM_VERSION, ORG_TYPES } from "@/lib/dbim/spec";

export const metadata = {
  title: "Methodology: every DBIM check explained",
  description: "How DBIM Validator scans a website and the full list of checks, each mapped to a section of the Digital Brand Identity Manual v3.0 and its Annexure F checklist.",
};

const SOURCE = {
  automated: "Measured directly in the rendered page (computed styles, network responses, DOM).",
  heuristic: "Inferred from text, structure and naming patterns; may need confirmation.",
  ai: "Judged by Claude from header/homepage/footer screenshots and page text.",
  manual: "Cannot be verified from outside the website; listed for the website team to confirm.",
} as const;

export default function Methodology() {
  const counts = ALL_RULES.reduce<Record<string, number>>((m, r) => ((m[r.source] = (m[r.source] ?? 0) + 1), m), {});
  return (
    <div className="container section">
      <h1>Methodology</h1>
      <p className="lead">
        Every check maps to a section of the <a href={DBIM_SOURCE_URL} target="_blank" rel="noreferrer">Digital Brand Identity Manual v{DBIM_VERSION}</a> and,
        where one exists, to an item of the Annexure F compliance matrix (F.1 generic checklist, F.2 Ministry/Department checklist).
      </p>

      <div className="card">
        <h2>How a scan works</h2>
        <ol>
          <li>The homepage and up to 14 inner pages (picked from the navigation and footer: About, Schemes, Documents, Contact, Media, …) are opened in Chromium at 1440px and 390px widths.</li>
          <li>For each page the scanner records computed styles of every visible element, all network responses (sizes, formats, caching), images, icons, links, forms, header and footer structure, hover behaviour, cookies, Core Web Vitals and an axe-core WCAG 2.1 AA audit.</li>
          <li>Site-wide checks run in parallel: link validation, accessible-PDF analysis (tag structure, language, title), Lighthouse, and an AI review of screenshots for visual rules.</li>
          <li>Rules evaluate the collected data. The score weights each check by severity (critical 3, major 2, minor 1) with pass = 1, warning = 0.5 and fail = 0; review and N/A items are excluded.</li>
        </ol>
        <h3>Organization types</h3>
        <ul>
          {Object.entries(ORG_TYPES).map(([k, v]) => <li key={k}><strong>{v.label}</strong> — {v.lockup}, {v.header}{k === "ministry" ? "; also runs the F.2 Ministry checklist." : "."}</li>)}
        </ul>
        <h3>Check types</h3>
        <ul>
          {Object.entries(SOURCE).map(([k, v]) => <li key={k}><span className={`tag tag-${k}`}>{k}</span> {v} ({counts[k] ?? 0} checks)</li>)}
        </ul>
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const rules = ALL_RULES.filter((r) => r.category === cat);
        if (!rules.length) return null;
        return (
          <div key={cat} className="section">
            <h2>{cat}</h2>
            <div className="table-wrap">
              <table className="list">
                <thead><tr><th>Check</th><th>DBIM section</th><th>Checklist</th><th>Type</th><th>Severity</th><th>Applies to</th></tr></thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td>{r.title}</td>
                      <td>§{r.section}</td>
                      <td>{r.checklist ?? "—"}</td>
                      <td><span className={`tag tag-${r.source}`}>{r.source}</span></td>
                      <td>{r.severity}</td>
                      <td>{r.appliesTo ? r.appliesTo.map((o) => ORG_TYPES[o].lockup).join(", ") : "All"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="card section">
        <h2>Known limitations</h2>
        <ul>
          <li>Notes on the manual itself: the functional palette prints Deep Blue as “#1DOA69” (read as #1D0A69); §A.5.6 refers to a non-existent “Section 5.7”; title limits differ between F.2 #16 (150 characters) and §A.5.3 (250).</li>
          <li>Pages behind login, CAPTCHAs or bot protection may not render fully. CCPS integrations done on the server cannot be seen from the browser.</li>
          <li>Colour matching uses a CIE ΔE tolerance of 6; anti-aliased or semi-transparent colours can be attributed to the nearest palette colour.</li>
          <li>Lighthouse runs with mobile throttling, so its timings are slower than a typical desktop visit.</li>
        </ul>
      </div>
    </div>
  );
}
