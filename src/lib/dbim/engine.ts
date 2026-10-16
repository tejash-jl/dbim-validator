import type { CheckResult, Rule, RuleContext, ScanReport, SiteData, Status } from "./types";
import { colourRules } from "./rules/colours";
import { iconRules } from "./rules/icons";
import { typographyRules } from "./rules/typography";
import { headerFooterRules, logoRules } from "./rules/header-footer";
import { imageryRules } from "./rules/imagery";
import { contentRules } from "./rules/content";
import { performanceRules } from "./rules/performance";
import { formRules, ministryRules } from "./rules/ministry";
import { aiRules, manualRules } from "./rules/ai-manual";
import { detectColourGroup } from "./rules/util";

export const ALL_RULES: Rule[] = [
  ...colourRules,
  ...iconRules,
  ...typographyRules,
  ...headerFooterRules,
  ...logoRules,
  ...imageryRules,
  ...contentRules,
  ...performanceRules,
  ...ministryRules,
  ...formRules,
  ...aiRules,
  ...manualRules,
];

export const CATEGORY_ORDER = [
  "Colours",
  "Iconography",
  "Typography",
  "Header & Footer",
  "Logo",
  "Imagery",
  "Content",
  "Search",
  "Performance",
  "Accessibility",
  "Ministry website",
  "Forms",
];

const SEVERITY_WEIGHT = { critical: 3, major: 2, minor: 1 } as const;
const STATUS_SCORE: Partial<Record<Status, number>> = { pass: 1, warn: 0.5, fail: 0 };

function scoreOf(results: CheckResult[]) {
  let num = 0, den = 0;
  for (const r of results) {
    const s = STATUS_SCORE[r.status];
    if (s === undefined) continue;
    const w = SEVERITY_WEIGHT[r.severity];
    num += s * w;
    den += w;
  }
  return den ? Math.round((num / den) * 100) : 0;
}

export function evaluate(site: SiteData, meta: { durationMs: number; notes: string[]; browser?: string }): ScanReport {
  const home = site.pages[0];
  const ctx: RuleContext = { site, home, orgType: site.options.orgType, colourGroup: detectColourGroup(site) };
  const results: CheckResult[] = [];
  for (const rule of ALL_RULES) {
    if (rule.appliesTo && !rule.appliesTo.includes(ctx.orgType)) continue;
    const base = { id: rule.id, title: rule.title, category: rule.category, section: rule.section, checklist: rule.checklist, severity: rule.severity, source: rule.source };
    try {
      const out = rule.run(ctx);
      results.push({ ...base, ...out });
    } catch (e) {
      results.push({ ...base, status: "error", message: `Rule failed: ${(e as Error).message}`, evidence: [] });
    }
  }
  results.sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category), cb = CATEGORY_ORDER.indexOf(b.category);
    return ca - cb;
  });

  const counts = { pass: 0, fail: 0, warn: 0, manual: 0, na: 0, error: 0 } as Record<Status, number>;
  results.forEach((r) => counts[r.status]++);
  const categoryScores = CATEGORY_ORDER.map((category) => {
    const rs = results.filter((r) => r.category === category);
    return {
      category,
      score: scoreOf(rs),
      pass: rs.filter((r) => r.status === "pass").length,
      fail: rs.filter((r) => r.status === "fail").length,
      warn: rs.filter((r) => r.status === "warn").length,
      manual: rs.filter((r) => r.status === "manual").length,
    };
  }).filter((c) => c.pass + c.fail + c.warn + c.manual > 0);

  return {
    url: home.finalUrl,
    orgType: ctx.orgType,
    options: site.options,
    scannedAt: new Date().toISOString(),
    durationMs: meta.durationMs,
    browser: meta.browser,
    pages: site.pages.map((p) => ({
      url: p.finalUrl,
      status: p.status,
      title: p.title,
      screenshotDesktop: p.screenshotDesktop,
      screenshotMobile: p.screenshotMobile,
      screenshotFold: p.screenshotFold,
      screenshotHeader: p.screenshotHeader,
      screenshotFooter: p.screenshotFooter,
    })),
    colourGroup: ctx.colourGroup,
    score: scoreOf(results),
    categoryScores,
    counts,
    results,
    lighthouse: site.lighthouse,
    notes: meta.notes,
  };
}
