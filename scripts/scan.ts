// CLI: npx tsx scripts/scan.ts <url> [--org ministry|org-emblem|org-no-emblem] [--pages N] [--no-lighthouse] [--no-ai] [--no-links] [--no-pdfs] [--json out.json] [--dry-run]
// The scan is saved to the app's database (shown in the web app's Recent scans, marked "CLI") unless --dry-run is given.
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { runScan } from "../src/lib/scanner/run";
import { completeScan, createCliScan, failScan, relativiseScreenshots, scanDir, updateProgress } from "../src/lib/db";
import { DEFAULT_OPTIONS, type ScanOptions } from "../src/lib/dbim/types";
import type { OrgType } from "../src/lib/dbim/spec";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a) && !["ministry", "org-emblem", "org-no-emblem"].includes(a) && !a.endsWith(".json") && !["chrome", "msedge", "chromium"].includes(a));
if (!url) {
  console.error("Usage: tsx scripts/scan.ts <url> [--org ministry|org-emblem|org-no-emblem] [--pages N] [--no-lighthouse] [--no-ai] [--no-links] [--no-pdfs] [--json out.json] [--browser chrome|msedge|chromium] [--headed | --headless] [--block-private] [--dry-run]");
  process.exit(1);
}
const flag = (n: string) => args.includes(`--${n}`);
const val = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const options: ScanOptions = {
  ...DEFAULT_OPTIONS,
  orgType: (val("org") as OrgType) ?? DEFAULT_OPTIONS.orgType,
  maxPages: val("pages") ? Number(val("pages")) : DEFAULT_OPTIONS.maxPages,
  lighthouse: !flag("no-lighthouse"),
  ai: !flag("no-ai"),
  checkLinks: !flag("no-links"),
  checkPdfs: !flag("no-pdfs"),
  // The CLI runs on your own machine, so local and private-network sites are allowed unless --block-private.
  allowPrivate: !flag("block-private"),
  // Show the browser by default when there's a screen to show it on; --headless (or CI) turns it off.
  headed: flag("headed") || (!flag("headless") && !process.env.CI && (process.platform !== "linux" || !!process.env.DISPLAY)),
};
if (val("browser")) process.env.DBIM_BROWSER = val("browser");

// Saved scans live in the app's database and scan folder; --dry-run keeps everything in data/cli and out of the web app.
const dryRun = flag("dry-run");
const scanId = dryRun ? null : createCliScan(url, options);
const outDir = scanId ? scanDir(scanId) : path.join(process.cwd(), "data", "cli", String(Date.now()));
const portal = (process.env.APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
if (scanId) {
  process.stderr.write(`Saving to the web app: ${portal}/scans/${scanId}\n`);
  // Ctrl+C: record the scan as stopped instead of leaving it "running" in the web app.
  for (const sig of ["SIGINT", "SIGTERM"] as const)
    process.on(sig, () => {
      failScan(scanId, "The command-line scan was stopped before it finished");
      process.exit(130);
    });
}
const icon = { pass: "✅", fail: "❌", warn: "⚠️ ", manual: "📝", na: "➖", error: "💥" } as const;

const t0 = Date.now();
runScan(url, options, outDir, (s, p) => {
  process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(0)}s ${p}%] ${s}\n`);
  if (scanId) updateProgress(scanId, s, p);
})
  .then(({ report }) => {
    if (scanId) completeScan(scanId, relativiseScreenshots(report, outDir));
    const jsonOut = val("json");
    if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
    console.log(`\nDBIM compliance — ${report.url}`);
    console.log(`Score ${report.score}/100 · colour group: ${report.colourGroup ?? "none"} · ${report.pages.length} page(s) · ${(report.durationMs / 1000).toFixed(0)}s${report.browser ? ` · ${report.browser}` : ""}`);
    console.log(Object.entries(report.counts).map(([k, v]) => `${k}: ${v}`).join("  "));
    let cat = "";
    for (const r of report.results) {
      if (r.category !== cat) console.log(`\n## ${(cat = r.category)}`);
      console.log(`${icon[r.status]} [§${r.section}] ${r.title}\n     ${r.message}`);
      for (const e of r.evidence.slice(0, 3)) console.log(`       · ${[e.page, e.selector, e.value, e.url, e.expected && `expected ${e.expected}`].filter(Boolean).join(" | ")}`);
    }
    if (report.notes.length) console.log(`\nNotes:\n- ${report.notes.join("\n- ")}`);
    console.log(`\nScreenshots: ${outDir}`);
    console.log(scanId ? `Report in the web app: ${portal}/scans/${scanId}` : "Dry run: not saved to the web app.");
  })
  .catch((e) => {
    if (scanId) failScan(scanId, (e as Error).message.split("\n")[0]);
    console.error(`Scan failed: ${(e as Error).message}`);
    process.exit(1);
  });
