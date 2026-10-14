import { chromium } from "playwright";
import { evaluate } from "../dbim/engine";
import type { PageData, ScanOptions, ScanReport, SiteData } from "../dbim/types";
import { runAiChecks } from "./ai";
import { collectPage } from "./collect";
import { pickPages } from "./crawl";
import { runLighthouse } from "./lighthouse";
import { checkLinks, checkPdfs } from "./links";
import { validateScanUrl } from "./safety";

export type Progress = (step: string, pct: number) => void;

const PAGE_CONCURRENCY = Math.max(1, Number(process.env.PAGE_CONCURRENCY || 3));

export async function runScan(rawUrl: string, options: ScanOptions, outDir: string, progress: Progress = () => {}): Promise<{ report: ScanReport; site: SiteData }> {
  const started = Date.now();
  const notes: string[] = [];
  const url = await validateScanUrl(rawUrl);
  const browser = await chromium.launch({ channel: "chromium", args: ["--disable-dev-shm-usage"] });
  const pages: PageData[] = [];
  try {
    progress("Loading homepage", 5);
    const home = await collectPage(browser, url.href, { outDir, index: 0, isHome: true, runSearch: true });
    if (home.status >= 400 || home.status === 0) throw new Error(`Homepage returned HTTP ${home.status || "no response"}`);
    pages.push(home);

    // Inner pages are collected a few at a time; each takes ~50s (scrolling, hover tests, axe, mobile pass).
    const extra = pickPages(home, Math.max(0, options.maxPages - 1));
    const collected: (PageData | null)[] = new Array(extra.length).fill(null);
    let next = 0, done = 0;
    const worker = async () => {
      while (next < extra.length) {
        const i = next++;
        try {
          const p = await collectPage(browser, extra[i], { outDir, index: i + 1, isHome: false, runSearch: false });
          if (p.status > 0 && p.status < 400) collected[i] = p;
          else notes.push(`Skipped ${extra[i]} (HTTP ${p.status})`);
        } catch (e) {
          notes.push(`Could not scan ${extra[i]}: ${(e as Error).message.split("\n")[0]}`);
        }
        done++;
        progress(`Scanned ${done + 1} of ${extra.length + 1} pages`, 10 + Math.round((done / extra.length) * 45));
      }
    };
    if (extra.length) progress(`Scanning ${extra.length} inner page(s)`, 10);
    await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, extra.length) }, worker));
    pages.push(...collected.filter((p): p is PageData => p !== null));
  } finally {
    await browser.close().catch(() => {});
  }

  const site: SiteData = { startUrl: url.href, options, pages, lighthouse: null, links: null, pdfs: null, ai: null };

  const tasks: Promise<void>[] = [];
  if (options.checkLinks)
    tasks.push(checkLinks(pages).then((r) => void (site.links = r)).catch((e) => void notes.push(`Link check failed: ${e.message}`)));
  if (options.checkPdfs)
    tasks.push(checkPdfs(pages).then((r) => void (site.pdfs = r)).catch((e) => void notes.push(`PDF check failed: ${e.message}`)));
  if (options.ai)
    tasks.push(
      runAiChecks(pages[0], options.orgType)
        .then((r) => void (site.ai = r))
        .catch((e) => {
          const msg = (e as Error).message;
          site.aiError = /authentication|api[_ -]?key|x-api-key/i.test(msg)
            ? "ANTHROPIC_API_KEY is not configured on the server"
            : msg.split("\n")[0].slice(0, 200);
        }),
    );
  progress("Checking links, PDFs and running AI review", 60);
  await Promise.all(tasks);

  if (options.lighthouse) {
    progress("Running Lighthouse", 80);
    try {
      site.lighthouse = await runLighthouse(pages[0].finalUrl);
    } catch (e) {
      site.lighthouseError = (e as Error).message.split("\n")[0].slice(0, 200);
    }
  }

  progress("Evaluating rules", 95);
  for (const p of pages) for (const err of p.errors) notes.push(`${p.finalUrl}: ${err}`);
  const report = evaluate(site, { durationMs: Date.now() - started, notes });
  return { report, site };
}
