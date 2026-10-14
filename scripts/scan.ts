// CLI: npx tsx scripts/scan.ts <url> [--org ministry|org-emblem|org-no-emblem] [--pages N] [--no-lighthouse] [--no-ai] [--no-links] [--no-pdfs] [--json out.json]
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { runScan } from "../src/lib/scanner/run";
import { DEFAULT_OPTIONS, type ScanOptions } from "../src/lib/dbim/types";
import type { OrgType } from "../src/lib/dbim/spec";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a) && !["ministry", "org-emblem", "org-no-emblem"].includes(a) && !a.endsWith(".json"));
if (!url) {
  console.error("Usage: tsx scripts/scan.ts <url> [--org ministry|org-emblem|org-no-emblem] [--pages N] [--no-lighthouse] [--no-ai] [--no-links] [--no-pdfs] [--json out.json]");
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
};

const outDir = path.join(process.cwd(), "data", "cli", String(Date.now()));
const icon = { pass: "✅", fail: "❌", warn: "⚠️ ", manual: "📝", na: "➖", error: "💥" } as const;

const t0 = Date.now();
runScan(url, options, outDir, (s, p) => process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(0)}s ${p}%] ${s}\n`))
  .then(({ report }) => {
    const jsonOut = val("json");
    if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
    console.log(`\nDBIM compliance — ${report.url}`);
    console.log(`Score ${report.score}/100 · colour group: ${report.colourGroup ?? "none"} · ${report.pages.length} page(s) · ${(report.durationMs / 1000).toFixed(0)}s`);
    console.log(Object.entries(report.counts).map(([k, v]) => `${k}: ${v}`).join("  "));
    let cat = "";
    for (const r of report.results) {
      if (r.category !== cat) console.log(`\n## ${(cat = r.category)}`);
      console.log(`${icon[r.status]} [§${r.section}] ${r.title}\n     ${r.message}`);
      for (const e of r.evidence.slice(0, 3)) console.log(`       · ${[e.page, e.selector, e.value, e.url, e.expected && `expected ${e.expected}`].filter(Boolean).join(" | ")}`);
    }
    if (report.notes.length) console.log(`\nNotes:\n- ${report.notes.join("\n- ")}`);
    console.log(`\nScreenshots: ${outDir}`);
  })
  .catch((e) => {
    console.error("Scan failed:", e);
    process.exit(1);
  });
