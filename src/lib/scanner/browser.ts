import { chromium, type Browser } from "playwright";

/** Which browser renders the scan. "chrome" and "msedge" are the installed browsers, "chromium" is Playwright's build. */
export type BrowserChoice = "chrome" | "msedge" | "chromium";

const LABEL: Record<BrowserChoice, string> = { chrome: "Google Chrome", msedge: "Microsoft Edge", chromium: "Chromium" };

export type LaunchedBrowser = {
  browser: Browser;
  choice: BrowserChoice;
  /** e.g. "Google Chrome 141.0.7390.55" — shown in the report. */
  label: string;
  /** Desktop and mobile user agents matching the real browser version (without "HeadlessChrome", which bot filters block). */
  userAgents: { desktop: string; mobile: string };
  /** Set when the requested browser was not available and Chromium was used instead. */
  fallbackNote?: string;
};

/** DBIM_BROWSER=chrome|msedge|chromium (default chrome: renders exactly as visitors' Chrome does). */
export function preferredBrowser(): BrowserChoice {
  const v = (process.env.DBIM_BROWSER || "chrome").toLowerCase();
  return v === "msedge" || v === "edge" ? "msedge" : v === "chromium" ? "chromium" : "chrome";
}

/** DBIM_HEADED=1 opens visible browser windows so you can watch a scan. */
export const headedByDefault = () => process.env.DBIM_HEADED === "1";

function userAgents(version: string) {
  const major = version.split(".")[0] || "140";
  return {
    desktop: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 DBIM-Validator/1.0`,
    mobile: `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36 DBIM-Validator/1.0`,
  };
}

export async function launchBrowser(opts: { choice?: BrowserChoice; headed?: boolean } = {}): Promise<LaunchedBrowser> {
  const choice = opts.choice ?? preferredBrowser();
  const launch = (c: BrowserChoice) =>
    chromium.launch({ channel: c, headless: !(opts.headed ?? headedByDefault()), args: ["--disable-dev-shm-usage"] });
  let browser: Browser;
  let used = choice;
  let fallbackNote: string | undefined;
  try {
    browser = await launch(choice);
  } catch (e) {
    if (choice === "chromium") throw e;
    browser = await launch("chromium");
    used = "chromium";
    fallbackNote = `${LABEL[choice]} is not installed, so Playwright's Chromium was used. Install ${LABEL[choice]} or set DBIM_BROWSER=chromium.`;
  }
  const version = browser.version();
  return { browser, choice: used, label: `${LABEL[used]} ${version}`, userAgents: userAgents(version), fallbackNote };
}
