// Background scan worker: claims queued scans from SQLite and runs them.
// Run alongside the web app: `npm run worker` (or `npm run dev` which starts both).
import "./load-env";
import path from "node:path";
import { claimNext, completeScan, failScan, requeueStale, scanDir, updateProgress } from "../src/lib/db";
import { runScan } from "../src/lib/scanner/run";
import type { ScanReport } from "../src/lib/dbim/types";

const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY || 2));
const POLL_MS = 1500;
const SCAN_TIMEOUT_MS = Number(process.env.SCAN_TIMEOUT_MS || 15 * 60_000);

let active = 0;
let stopping = false;

/** Store screenshot paths relative to the scan folder so the API can serve them. */
function relativise(report: ScanReport, dir: string): ScanReport {
  const rel = (p?: string) => (p ? path.relative(dir, p) : undefined);
  return {
    ...report,
    pages: report.pages.map((p) => ({
      ...p,
      screenshotDesktop: rel(p.screenshotDesktop),
      screenshotMobile: rel(p.screenshotMobile),
      screenshotFold: rel(p.screenshotFold),
      screenshotHeader: rel(p.screenshotHeader),
      screenshotFooter: rel(p.screenshotFooter),
    })),
  };
}

async function work(id: string, url: string, options: Parameters<typeof runScan>[1]) {
  const dir = scanDir(id);
  const t0 = Date.now();
  console.log(`[worker] ▶ ${id} ${url}`);
  try {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, rej) => (timer = setTimeout(() => rej(new Error("Scan timed out")), SCAN_TIMEOUT_MS)));
    const { report } = await Promise.race([runScan(url, options, dir, (step, pct) => {
      updateProgress(id, step, pct);
      console.log(`[worker]   ${id} +${((Date.now() - t0) / 1000).toFixed(0)}s ${step}`);
    }), timeout]);
    clearTimeout(timer);
    completeScan(id, relativise(report, dir));
    console.log(`[worker] ✔ ${id} score ${report.score} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } catch (e) {
    const msg = (e as Error).message.split("\n")[0];
    failScan(id, msg);
    console.error(`[worker] ✖ ${id} ${msg}`);
  }
}

async function loop() {
  const n = requeueStale();
  if (n) console.log(`[worker] re-queued ${n} interrupted scan(s)`);
  console.log(`[worker] started, concurrency ${CONCURRENCY}`);
  while (!stopping) {
    while (active < CONCURRENCY) {
      const job = claimNext();
      if (!job) break;
      active++;
      work(job.id, job.url, job.options).finally(() => active--);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    stopping = true;
    console.log(`[worker] stopping (${active} active scan(s) will be re-queued on next start)`);
    process.exit(0);
  });

loop();
