import { chromium } from "playwright";
import type { LighthouseSummary } from "../dbim/types";

/** §10 — loading performance, interactivity and visual stability via Lighthouse (mobile emulation). */
export async function runLighthouse(url: string): Promise<LighthouseSummary> {
  const { launch } = await import("chrome-launcher");
  const lighthouse = (await import("lighthouse")).default;
  const chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--ignore-certificate-errors",
      // Lighthouse's Chrome is not behind the request guard, so refuse obvious internal targets.
      ...(process.env.ALLOW_PRIVATE_URLS === "1"
        ? []
        : ["--host-resolver-rules=MAP localhost ~NOTFOUND, MAP *.localhost ~NOTFOUND, MAP *.internal ~NOTFOUND, MAP 169.254.169.254 ~NOTFOUND, MAP metadata.google.internal ~NOTFOUND"]),
    ],
  });
  try {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      maxWaitForLoad: 60_000,
    });
    if (!result) throw new Error("Lighthouse returned no result");
    const lhr = result.lhr;
    const score = (k: string) => (lhr.categories[k]?.score == null ? null : Math.round((lhr.categories[k].score as number) * 100));
    const num = (k: string) => (lhr.audits[k]?.numericValue == null ? null : Math.round(lhr.audits[k].numericValue as number * 1000) / 1000);
    return {
      performance: score("performance"),
      accessibility: score("accessibility"),
      bestPractices: score("best-practices"),
      seo: score("seo"),
      lcp: num("largest-contentful-paint"),
      cls: num("cumulative-layout-shift"),
      tbt: num("total-blocking-time"),
      fcp: num("first-contentful-paint"),
      si: num("speed-index"),
      formFactor: lhr.configSettings.formFactor,
    };
  } finally {
    await chrome.kill();
  }
}
