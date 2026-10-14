import type { Evidence, Rule } from "../types";
import { cap, fmtBytes, grade, pageLabel } from "./util";

const PERF = "Performance";
const A11Y = "Accessibility";

export const performanceRules: Rule[] = [
  {
    id: "search.present",
    title: "Search is available in the header",
    category: "Search",
    section: "9 v, 5.4",
    checklist: "F.1 #43",
    severity: "major",
    source: "automated",
    run: ({ home }) => ({
      status: home.header.hasSearch ? "pass" : "fail",
      message: home.header.hasSearch ? "A search control is present in the header." : "No search control was found in the header.",
      evidence: [],
      fix: "Add a search bar to the header that covers HTML pages, PDFs and image metadata.",
    }),
  },
  {
    id: "search.works",
    title: "Search returns results",
    category: "Search",
    section: "9",
    checklist: "F.1 #43",
    severity: "major",
    source: "automated",
    run: ({ home }) => {
      const s = home.search;
      if (!s.attempted) return { status: "na", message: s.note, evidence: [] };
      return {
        status: s.worked === true ? "pass" : s.worked === false ? "fail" : "manual",
        message: s.note,
        evidence: [],
        fix: "Ensure the search form submits and shows relevant, filterable results; handle empty queries with suggestions.",
      };
    },
  },
  {
    id: "perf.responsive",
    title: "Website is responsive across screen sizes",
    category: PERF,
    section: "10.2.2, 7.2.1",
    checklist: "F.1 #46",
    severity: "critical",
    source: "automated",
    run: ({ site }) => {
      const bad: Evidence[] = [];
      for (const p of site.pages) {
        if (!p.metaViewport || !/width\s*=\s*device-width/i.test(p.metaViewport)) bad.push({ page: pageLabel(p), value: `meta viewport: ${p.metaViewport ?? "missing"}`, expected: "width=device-width, initial-scale=1" });
        if (p.mobile && p.mobile.scrollWidth > p.mobile.width + 4) bad.push({ page: pageLabel(p), value: `horizontal scroll at ${p.mobile.width}px (content is ${p.mobile.scrollWidth}px wide)` });
        if (p.mobile) {
          const tiny = p.mobile.texts.filter((t) => t.fontSize < 10).reduce((s, t) => s + t.chars, 0);
          const all = p.mobile.texts.reduce((s, t) => s + t.chars, 0);
          if (all && tiny / all > 0.1) bad.push({ page: pageLabel(p), value: `${Math.round((tiny / all) * 100)}% of mobile text is smaller than 10px` });
        }
      }
      return {
        status: bad.length === 0 ? "pass" : "fail",
        message: bad.length ? `${bad.length} responsiveness issue(s) at 390px width.` : "All pages fit a 390px mobile viewport without horizontal scrolling.",
        evidence: cap(bad),
        fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> and use fluid layouts; test on phone and tablet widths.',
      };
    },
  },
  {
    id: "perf.lighthouse",
    title: "Lighthouse performance score",
    category: PERF,
    section: "10.1, 10.4.3",
    severity: "major",
    source: "automated",
    run: ({ site }) => {
      const lh = site.lighthouse;
      if (!lh) return { status: site.lighthouseError ? "error" : "manual", message: site.lighthouseError ? `Lighthouse failed: ${site.lighthouseError}` : "Lighthouse was disabled for this scan.", evidence: [] };
      const s = lh.performance ?? 0;
      return {
        status: s >= 90 ? "pass" : s >= 50 ? "warn" : "fail",
        message: `Lighthouse (${lh.formFactor}) — Performance ${lh.performance}, Accessibility ${lh.accessibility}, Best Practices ${lh.bestPractices}, SEO ${lh.seo}.`,
        evidence: [
          { value: `First Contentful Paint ${lh.fcp != null ? (lh.fcp / 1000).toFixed(1) + " s" : "n/a"}` },
          { value: `Speed Index ${lh.si != null ? (lh.si / 1000).toFixed(1) + " s" : "n/a"}` },
        ],
        fix: "Minimise server response time, enable caching and compression, optimise images and defer non-critical scripts (DBIM §10.1).",
      };
    },
  },
  {
    id: "perf.vitals",
    title: "Core Web Vitals: loading, interactivity and visual stability",
    category: PERF,
    section: "10.1–10.3",
    severity: "major",
    source: "automated",
    run: ({ site, home }) => {
      const lh = site.lighthouse;
      const lcp = lh?.lcp ?? home.perf.lcp;
      const cls = lh?.cls ?? home.perf.cls;
      const tbt = lh?.tbt ?? null;
      const ev: Evidence[] = [
        { value: `Largest Contentful Paint: ${lcp != null ? (lcp / 1000).toFixed(2) + " s" : "n/a"}`, expected: "≤ 2.5 s" },
        { value: `Cumulative Layout Shift: ${cls ?? "n/a"}`, expected: "≤ 0.1" },
        ...(tbt != null ? [{ value: `Total Blocking Time: ${Math.round(tbt)} ms`, expected: "≤ 200 ms" }] : []),
        { note: lh ? "From Lighthouse (mobile emulation, throttled)" : "Measured in an unthrottled desktop browser session" },
      ];
      const bad = (lcp != null && lcp > 4000) || (cls != null && cls > 0.25) || (tbt != null && tbt > 600);
      const good = (lcp == null || lcp <= 2500) && (cls == null || cls <= 0.1) && (tbt == null || tbt <= 200);
      return {
        status: bad ? "fail" : good ? "pass" : "warn",
        message: `LCP ${lcp != null ? (lcp / 1000).toFixed(2) + "s" : "n/a"}, CLS ${cls ?? "n/a"}${tbt != null ? `, TBT ${Math.round(tbt)}ms` : ""}.`,
        evidence: ev,
        fix: "Preload the hero image, set width/height on media to avoid layout shifts and split/defer heavy JavaScript.",
      };
    },
  },
  {
    id: "perf.lazy-loading",
    title: "Below-the-fold images are lazy-loaded",
    category: PERF,
    section: "10.1.2",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      let below = 0;
      const bad: Evidence[] = [];
      for (const p of site.pages)
        for (const i of p.images) {
          if (i.isBackground || i.top < p.desktop.height * 1.5) continue;
          below++;
          if (i.loading !== "lazy") bad.push({ page: pageLabel(p), url: i.src });
        }
      if (!below) return { status: "na", message: "No below-the-fold images found.", evidence: [] };
      const r = 1 - bad.length / below;
      return {
        status: grade(r, 0.8, 0.4),
        message: `${below - bad.length} of ${below} below-the-fold images use loading="lazy".`,
        evidence: cap(bad, 8),
        fix: 'Add loading="lazy" to images below the first screen.',
      };
    },
  },
  {
    id: "perf.image-dimensions",
    title: "Images declare width and height (no layout shifts)",
    category: PERF,
    section: "10.3.1",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const imgs = site.pages.flatMap((p) => p.images.filter((i) => !i.isBackground).map((i) => ({ ...i, page: pageLabel(p) })));
      if (!imgs.length) return { status: "na", message: "No images found.", evidence: [] };
      const bad = imgs.filter((i) => !i.hasDims);
      const r = 1 - bad.length / imgs.length;
      return {
        status: grade(r, 0.8, 0.5),
        message: `${imgs.length - bad.length} of ${imgs.length} images have width and height attributes.`,
        evidence: cap(bad.map((i) => ({ page: i.page, url: i.src })), 8),
        fix: "Set width and height attributes (or CSS aspect-ratio) on every image and embed.",
      };
    },
  },
  {
    id: "perf.caching",
    title: "Static resources use browser caching and compression",
    category: PERF,
    section: "10.1.4, 10.4.2",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const statics = site.pages.flatMap((p) => p.network.filter((n) => ["script", "stylesheet", "image", "font"].includes(n.type) && !n.fromThirdParty && n.status === 200));
      const uniq = [...new Map(statics.map((s) => [s.url, s])).values()];
      if (!uniq.length) return { status: "na", message: "No first-party static resources recorded.", evidence: [] };
      const uncached = uniq.filter((n) => !n.cacheControl || /no-store|no-cache|max-age=0\b/.test(n.cacheControl));
      const text = site.pages.flatMap((p) => p.network.filter((n) => ["document", "script", "stylesheet"].includes(n.type) && (n.bytes ?? 0) > 2048 && n.status === 200));
      const uncompressed = [...new Map(text.filter((n) => !n.encoding).map((n) => [n.url, n])).values()];
      const r = 1 - uncached.length / uniq.length;
      return {
        status: r >= 0.8 && uncompressed.length <= 2 ? "pass" : r >= 0.5 ? "warn" : "fail",
        message: `${uniq.length - uncached.length} of ${uniq.length} static resources are cacheable; ${uncompressed.length} text resource(s) served without compression.`,
        evidence: cap([
          ...uncached.map((n) => ({ url: n.url, value: `Cache-Control: ${n.cacheControl ?? "(none)"}` })),
          ...uncompressed.map((n) => ({ url: n.url, value: `uncompressed ${fmtBytes(n.bytes)}` })),
        ], 10),
        fix: "Serve static assets with long Cache-Control max-age (fingerprinted file names), enable gzip/brotli, and consider a CDN.",
      };
    },
  },
  {
    id: "perf.third-party",
    title: "Third-party scripts are limited",
    category: PERF,
    section: "10.4.1",
    severity: "minor",
    source: "automated",
    run: ({ home }) => {
      const scripts = home.network.filter((n) => n.type === "script" && n.fromThirdParty);
      const hosts = [...new Set(scripts.map((s) => new URL(s.url).hostname))];
      const weight = home.network.reduce((s, n) => s + (n.bytes ?? 0), 0);
      return {
        status: scripts.length <= 8 && weight <= 5 * 1024 * 1024 ? "pass" : scripts.length <= 15 && weight <= 10 * 1024 * 1024 ? "warn" : "fail",
        message: `Homepage loads ${scripts.length} third-party script(s) from ${hosts.length} host(s); total page weight ${fmtBytes(weight)}.`,
        evidence: hosts.slice(0, 12).map((h) => ({ value: h })),
        fix: "Remove unneeded third-party scripts, load the rest with async/defer, and keep total page weight low.",
      };
    },
  },
  {
    id: "a11y.axe-serious",
    title: "No critical or serious WCAG 2.1 AA violations",
    category: A11Y,
    section: "8, GIGW 3.0",
    severity: "critical",
    source: "automated",
    run: ({ site }) => {
      const pages = site.pages.filter((p) => p.axe);
      if (!pages.length) return { status: "error", message: "The accessibility engine could not run.", evidence: [] };
      const agg = new Map<string, { help: string; impact: string; nodes: number; pages: Set<string>; url: string; sample: string }>();
      for (const p of pages)
        for (const v of p.axe!) {
          if (v.impact !== "critical" && v.impact !== "serious") continue;
          const a = agg.get(v.id) ?? { help: v.help, impact: v.impact, nodes: 0, pages: new Set(), url: v.helpUrl, sample: v.nodes[0]?.target ?? "" };
          a.nodes += v.nodes.length;
          a.pages.add(pageLabel(p));
          agg.set(v.id, a);
        }
      const list = [...agg.entries()].sort((a, b) => (a[1].impact === "critical" ? -1 : 1) - (b[1].impact === "critical" ? -1 : 1) || b[1].nodes - a[1].nodes);
      return {
        status: list.length === 0 ? "pass" : "fail",
        message: list.length ? `${list.length} critical/serious accessibility rule(s) violated across ${pages.length} page(s).` : `No critical or serious axe-core violations on ${pages.length} page(s).`,
        evidence: list.slice(0, 15).map(([id, a]) => ({ value: `[${a.impact}] ${a.help} — ${a.nodes} element(s)`, selector: a.sample, page: [...a.pages].slice(0, 3).join(", "), url: a.url, note: id })),
        fix: "Fix each violation (see the linked rule help). Full GIGW 3.0 conformance needs STQC certification.",
      };
    },
  },
  {
    id: "a11y.axe-moderate",
    title: "Moderate / minor WCAG issues",
    category: A11Y,
    section: "8, GIGW 3.0",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const pages = site.pages.filter((p) => p.axe);
      if (!pages.length) return { status: "error", message: "The accessibility engine could not run.", evidence: [] };
      const agg = new Map<string, { help: string; impact: string; nodes: number; url: string; sample: string }>();
      for (const p of pages)
        for (const v of p.axe!) {
          if (v.impact === "critical" || v.impact === "serious") continue;
          const a = agg.get(v.id) ?? { help: v.help, impact: v.impact ?? "minor", nodes: 0, url: v.helpUrl, sample: v.nodes[0]?.target ?? "" };
          a.nodes += v.nodes.length;
          agg.set(v.id, a);
        }
      return {
        status: agg.size === 0 ? "pass" : "warn",
        message: agg.size ? `${agg.size} moderate/minor accessibility rule(s) violated.` : "No moderate or minor axe-core violations.",
        evidence: [...agg.entries()].slice(0, 12).map(([id, a]) => ({ value: `[${a.impact}] ${a.help} — ${a.nodes} element(s)`, selector: a.sample, url: a.url, note: id })),
      };
    },
  },
  {
    id: "a11y.structure",
    title: "Pages have a single H1 and a logical heading hierarchy",
    category: A11Y,
    section: "7.1.3.3 v, 8.1",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const bad: Evidence[] = [];
      for (const p of site.pages) {
        const hs = p.desktop.headings;
        const h1 = hs.filter((h) => h.level === 1).length;
        if (h1 === 0) bad.push({ page: pageLabel(p), value: "no H1" });
        if (h1 > 1) bad.push({ page: pageLabel(p), value: `${h1} H1 headings` });
        for (let i = 1; i < hs.length; i++)
          if (hs[i].level > hs[i - 1].level + 1) {
            bad.push({ page: pageLabel(p), value: `H${hs[i - 1].level} → H${hs[i].level} skips a level ("${hs[i].text.slice(0, 40)}")` });
            break;
          }
      }
      return {
        status: bad.length === 0 ? "pass" : "warn",
        message: bad.length ? `${bad.length} heading-structure issue(s).` : "Every page has one H1 and no skipped heading levels.",
        evidence: cap(bad),
        fix: "Use exactly one H1 per page and nest H2/H3 in order.",
      };
    },
  },
];

