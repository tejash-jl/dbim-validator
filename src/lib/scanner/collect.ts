import fs from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import type { AxeViolation, NetworkEntry, PageData, ViewportData } from "../dbim/types";
import { isHostAllowed, siteKey } from "./safety";

const INPAGE_SOURCE = fs.readFileSync(path.join(process.cwd(), "src/lib/scanner/inpage.js"), "utf8");

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const UA_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 DBIM-Validator/1.0";
const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 DBIM-Validator/1.0";

// Records LCP/CLS from document start so the values reflect page load, not our later scrolling.
const PERF_INIT = `(() => {
  const s = (window.__dbimPerfState = { lcp: null, cls: 0 });
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { s.lcp = e.renderTime || e.loadTime || e.startTime; })).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) s.cls += e.value; })).observe({ type: "layout-shift", buffered: true }); } catch {}
})();`;

const TRACKING_COOKIE = /^(_ga|_gid|_gat|_gcl|_fbp|_fbc|_hj|__utm|_clck|_clsk|IDE$|NID$|_uetsid|_uetvid|__gads|_pin_|mp_|ajs_)/i;

async function guardedContext(browser: Browser, opts: Parameters<Browser["newContext"]>[0]): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, ...opts });
  await ctx.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (!/^(https?|data|blob):$/.test(u.protocol)) return route.continue();
    if (u.protocol.startsWith("http") && !(await isHostAllowed(u.hostname))) return route.abort("blockedbyclient");
    return route.continue();
  });
  return ctx;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
  // Scroll through the page so lazy content renders, then return to the top.
  await page
    .evaluate(
      `(async () => {
        const step = innerHeight * 0.9;
        const max = Math.min(document.documentElement.scrollHeight, 20000);
        for (let y = 0; y < max; y += step) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
        scrollTo(0, 0);
      })()`,
    )
    .catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function inject(page: Page) {
  await page.evaluate(INPAGE_SOURCE);
}

async function screenshotTo(page: Page, file: string, maxHeight = 9000) {
  const h: number = await page.evaluate("document.documentElement.scrollHeight").catch(() => 900) as number;
  const w = page.viewportSize()!.width;
  await page
    .screenshot({ path: file, type: "jpeg", quality: 60, fullPage: true, clip: { x: 0, y: 0, width: w, height: Math.min(h, maxHeight) } })
    .catch(() => page.screenshot({ path: file, type: "jpeg", quality: 60 }));
}

async function elementShot(page: Page, selector: string, file: string, fallbackClip?: { x: number; y: number; width: number; height: number }) {
  try {
    const box = await page.locator(selector).first().boundingBox({ timeout: 2000 });
    if (box && box.width > 0 && box.height > 0) {
      const scrollY = (await page.evaluate("scrollY")) as number;
      await page.screenshot({
        path: file,
        type: "jpeg",
        quality: 75,
        fullPage: true,
        clip: { x: Math.max(0, box.x), y: Math.max(0, box.y + scrollY), width: Math.min(box.width, page.viewportSize()!.width), height: Math.min(box.height, 1400) },
      });
      return file;
    }
  } catch {}
  if (fallbackClip) {
    await page.screenshot({ path: file, type: "jpeg", quality: 75, clip: fallbackClip }).catch(() => {});
    return file;
  }
  return undefined;
}

function recordNetwork(page: Page, startHost: string, out: NetworkEntry[]) {
  const key = siteKey(startHost);
  page.on("requestfinished", async (req) => {
    try {
      const res = await req.response();
      if (!res) return;
      const sizes = await req.sizes().catch(() => null);
      const headers = res.headers();
      const host = new URL(req.url()).hostname;
      const len = headers["content-length"] ? parseInt(headers["content-length"], 10) : null;
      out.push({
        url: req.url(),
        type: req.resourceType(),
        status: res.status(),
        mime: (headers["content-type"] || "").split(";")[0],
        bytes: sizes && sizes.responseBodySize > 0 ? sizes.responseBodySize : len,
        cacheControl: headers["cache-control"] ?? null,
        encoding: headers["content-encoding"] ?? null,
        fromThirdParty: !!host && siteKey(host) !== key,
      });
    } catch {}
  });
}

async function hoverTest(page: Page): Promise<PageData["hover"]> {
  const out: PageData["hover"] = [];
  for (let i = 0; i < 8; i++) {
    const loc = page.locator(`[data-dbim-hover="${i}"]`);
    if ((await loc.count()) === 0) break;
    try {
      await page.mouse.move(0, 0);
      await loc.scrollIntoViewIfNeeded({ timeout: 1500 });
      await page.waitForTimeout(150);
      const before = (await page.evaluate(`window.__dbim.hoverStyles(${i})`)) as { sel: string; styles: Record<string, string> } | null;
      await loc.hover({ timeout: 1500 });
      await page.waitForTimeout(450); // let transitions finish
      const after = (await page.evaluate(`window.__dbim.hoverStyles(${i})`)) as { sel: string; styles: Record<string, string> } | null;
      if (!before || !after) continue;
      const props = Object.keys(before.styles).filter((k) => before.styles[k] !== after.styles[k]);
      out.push({ sel: before.sel, changed: props.length > 0, props: props.map((p) => p.split(":")[1]) });
    } catch {}
  }
  await page.mouse.move(0, 0).catch(() => {});
  return out;
}

async function searchTest(ctx: BrowserContext, url: string): Promise<PageData["search"]> {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await inject(page);
    const kind = (await page.evaluate("window.__dbim.findSearchInput()")) as string | null;
    if (!kind) return { attempted: false, worked: null, note: "No search box found in the header." };
    if (kind === "toggle") {
      await page.locator('[data-dbim-search="toggle"]').first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
    const input = page.locator('[data-dbim-search="input"]').first();
    if ((await input.count()) === 0 || !(await input.isVisible().catch(() => false)))
      return { attempted: true, worked: null, note: "Search control found but no visible input appeared after activating it." };
    const beforeUrl = page.url();
    const beforeText = ((await page.evaluate("document.body.innerText.length")) as number) || 0;
    await input.fill("scheme", { timeout: 3000 });
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {}),
      input.press("Enter", { timeout: 3000 }),
    ]);
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(800);
    const afterUrl = page.url();
    const afterText = ((await page.evaluate("document.body.innerText")) as string) || "";
    const urlChanged = afterUrl !== beforeUrl;
    const mentionsResults = /result|found|showing|matches|परिणाम/i.test(afterText);
    const noResults = /no\s+(results|records|matches)\s+found|0\s+results/i.test(afterText);
    if ((urlChanged || Math.abs(afterText.length - beforeText) > 200) && mentionsResults && !noResults)
      return { attempted: true, worked: true, note: `Searching for "scheme" returned a results view (${afterUrl}).` };
    if (noResults) return { attempted: true, worked: false, note: `Searching for "scheme" returned no results (${afterUrl}).` };
    if (urlChanged) return { attempted: true, worked: true, note: `Search navigated to ${afterUrl}; results could not be confirmed automatically.` };
    return { attempted: true, worked: false, note: "Submitting a query did not navigate or show results." };
  } catch (e) {
    return { attempted: true, worked: null, note: `Search test failed: ${(e as Error).message.split("\n")[0]}` };
  } finally {
    await page.close().catch(() => {});
  }
}

async function runAxe(page: Page): Promise<AxeViolation[] | null> {
  try {
    const res = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    return res.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.slice(0, 8).map((n) => ({
        target: n.target.map(String).join(" "),
        html: n.html.slice(0, 200),
        summary: (n.failureSummary || "").slice(0, 300),
      })),
    }));
  } catch {
    return null;
  }
}

export type CollectOptions = { outDir: string; index: number; isHome: boolean; runSearch: boolean };

export async function collectPage(browser: Browser, url: string, opts: CollectOptions): Promise<PageData> {
  const errors: string[] = [];
  const network: NetworkEntry[] = [];
  const startHost = new URL(url).hostname;
  const prefix = path.join(opts.outDir, `p${opts.index}`);
  fs.mkdirSync(opts.outDir, { recursive: true });

  const ctx = await guardedContext(browser, { viewport: DESKTOP, userAgent: UA_DESKTOP, locale: "en-IN" });
  await ctx.addInitScript(PERF_INIT);
  try {
    const page = await ctx.newPage();
    recordNetwork(page, startHost, network);
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const status = resp?.status() ?? 0;
    // Tracking cookies set before the visitor has made any consent choice.
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    const cookiesBeforeConsent = (await ctx.cookies())
      .filter((c) => TRACKING_COOKIE.test(c.name))
      .map((c) => ({ name: c.name, domain: c.domain }));
    const loadPerf = (await page.evaluate("JSON.stringify(window.__dbimPerfState || null)").then((s) => JSON.parse(s as string)).catch(() => null)) as { lcp: number | null; cls: number } | null;
    await settle(page);
    await inject(page);

    const perf = (await page.evaluate("window.__dbim.perf()")) as PageData["perf"];
    if (loadPerf) {
      perf.lcp = loadPerf.lcp === null ? perf.lcp : Math.round(loadPerf.lcp);
      perf.cls = Math.round(loadPerf.cls * 1000) / 1000;
    }
    const pageInfo = (await page.evaluate("window.__dbim.collectPage()")) as Omit<
      PageData,
      "url" | "finalUrl" | "status" | "desktop" | "mobile" | "network" | "perf" | "axe" | "errors" | "hover" | "search" | "cookiesBeforeConsent"
    >;
    const desktop = (await page.evaluate("window.__dbim.collectViewport()")) as ViewportData;

    const screenshotDesktop = `${prefix}-desktop.jpg`;
    await screenshotTo(page, screenshotDesktop);
    desktop.screenshot = screenshotDesktop;
    const screenshotFold = `${prefix}-fold.jpg`;
    await page.screenshot({ path: screenshotFold, type: "jpeg", quality: 70 }).catch(() => {});
    const screenshotHeader = await elementShot(page, '[data-dbim="header"]', `${prefix}-header.jpg`, { x: 0, y: 0, width: DESKTOP.width, height: 320 });
    const screenshotFooter = pageInfo.footer.found ? await elementShot(page, '[data-dbim="footer"]', `${prefix}-footer.jpg`) : undefined;

    // Sticky header: scroll down and see whether the header/navigation is still pinned.
    await page.evaluate("scrollTo(0, Math.min(1500, document.documentElement.scrollHeight / 2))");
    await page.waitForTimeout(500);
    pageInfo.header.stickyAfterScroll = (await page.evaluate("window.__dbim.stickyCheck()").catch(() => null)) as boolean | null;
    await page.evaluate("scrollTo(0, 0)");
    await page.waitForTimeout(300);

    const hover = await hoverTest(page);
    const axe = await runAxe(page);
    if (axe === null) errors.push("axe-core accessibility scan failed on this page");
    const search = opts.runSearch ? await searchTest(ctx, page.url()) : { attempted: false, worked: null, note: "Search is tested on the homepage only." };
    const finalUrl = page.url();
    await page.close();
    // Redirects (e.g. to an IDN domain) keep the site first-party.
    const firstParty = new Set([siteKey(startHost), siteKey(new URL(finalUrl).hostname)]);
    for (const n of network) n.fromThirdParty = !firstParty.has(siteKey(new URL(n.url).hostname));

    // ----- Mobile pass -----
    let mobile: ViewportData | null = null;
    let screenshotMobile: string | undefined;
    const mctx = await guardedContext(browser, { viewport: MOBILE, userAgent: UA_MOBILE, isMobile: true, hasTouch: true, locale: "en-IN" });
    try {
      const mpage = await mctx.newPage();
      await mpage.goto(finalUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await settle(mpage);
      await inject(mpage);
      mobile = (await mpage.evaluate("window.__dbim.collectViewport()")) as ViewportData;
      screenshotMobile = `${prefix}-mobile.jpg`;
      await screenshotTo(mpage, screenshotMobile, 7000);
      mobile.screenshot = screenshotMobile;
    } catch (e) {
      errors.push(`Mobile render failed: ${(e as Error).message.split("\n")[0]}`);
    } finally {
      await mctx.close().catch(() => {});
    }

    return {
      url,
      finalUrl,
      status,
      ...pageInfo,
      desktop,
      mobile,
      network,
      perf,
      axe,
      hover,
      search,
      cookiesBeforeConsent,
      errors,
      screenshotDesktop,
      screenshotMobile,
      screenshotFold,
      screenshotHeader,
      screenshotFooter,
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}
