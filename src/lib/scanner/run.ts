import { evaluate } from "../dbim/engine";
import type { PageData, ScanOptions, ScanReport, SiteData } from "../dbim/types";
import { runAiChecks } from "./ai";
import { launchBrowser } from "./browser";
import { collectPage } from "./collect";
import { pickPages } from "./crawl";
import { runLighthouse } from "./lighthouse";
import { checkLinks, checkPdfs } from "./links";
import { isLocalHost, validateScanUrl } from "./safety";

export type Progress = (step: string, pct: number) => void;

const PAGE_CONCURRENCY = Math.max(1, Number(process.env.PAGE_CONCURRENCY || 3));

/** Turn browser navigation errors into something a person can act on. */
export function explainLoadError(e: Error, url: URL): string {
  const m = e.message;
  const local = isLocalHost(url.hostname);
  if (/ERR_CONNECTION_REFUSED/.test(m))
    return local ? `Nothing is running at ${url.host}. Start your site's dev server, or check the port.` : `${url.host} refused the connection.`;
  if (/ERR_NAME_NOT_RESOLVED/.test(m)) return `${url.hostname} could not be found. Check the address.`;
  if (/Timeout|ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT/.test(m))
    return `${url.host} did not respond within 60 seconds. The site may be down, very slow, or reachable only from certain networks.`;
  if (/ERR_CERT|SSL/.test(m)) return `${url.host} has a TLS certificate problem: ${m.split("\n")[0]}`;
  return m.split("\n")[0];
}

export async function runScan(rawUrl: string, options: ScanOptions, outDir: string, progress: Progress = () => {}): Promise<{ report: ScanReport; site: SiteData }> {
  const started = Date.now();
  const notes: string[] = [];
  const allowPrivate = options.allowPrivate ?? false;
  const url = await validateScanUrl(rawUrl, allowPrivate);
  const launched = await launchBrowser({ headed: options.headed });
  const { browser, userAgents } = launched;
  if (launched.fallbackNote) notes.push(launched.fallbackNote);
  if (isLocalHost(url.hostname))
    notes.push("This is a local or private-network site. HTTPS, caching, compression and performance results reflect this server, which may differ from production.");
  const pages: PageData[] = [];
  try {
    progress("Loading homepage", 5);
    const home = await collectPage(browser, url.href, { outDir, index: 0, isHome: true, runSearch: true, allowPrivate, userAgents }).catch((e) => {
      throw new Error(explainLoadError(e as Error, url));
    });
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
          const p = await collectPage(browser, extra[i], { outDir, index: i + 1, isHome: false, runSearch: false, allowPrivate, userAgents });
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
    // A browser that is updating itself can take minutes to exit; don't let that hold up the report.
    await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 10_000))]);
  }

  const site: SiteData = { startUrl: url.href, options, pages, lighthouse: null, links: null, pdfs: null, ai: null };

  const tasks: Promise<void>[] = [];
  if (options.checkLinks)
    tasks.push(checkLinks(pages, allowPrivate).then((r) => void (site.links = r)).catch((e) => void notes.push(`Link check failed: ${e.message}`)));
  if (options.checkPdfs)
    tasks.push(checkPdfs(pages, allowPrivate).then((r) => void (site.pdfs = r)).catch((e) => void notes.push(`PDF check failed: ${e.message}`)));
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
      site.lighthouse = await runLighthouse(pages[0].finalUrl, { browser: launched.choice, allowPrivate });
    } catch (e) {
      site.lighthouseError = (e as Error).message.split("\n")[0].slice(0, 200);
    }
  }

  progress("Evaluating rules", 95);
  for (const p of pages) for (const err of p.errors) notes.push(`${p.finalUrl}: ${err}`);
  const report = evaluate(site, { durationMs: Date.now() - started, notes, browser: launched.label });
  return { report, site };
}
