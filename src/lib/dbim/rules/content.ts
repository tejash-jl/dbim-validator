import { CCPS_HOST_PATTERN, DOC_MAX_BYTES, EDITABLE_DOC_EXT } from "../spec";
import type { Evidence, Rule } from "../types";
import { cap, fmtBytes, pageLabel, shortUrl } from "./util";

const CAT = "Content";
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const MONTH_FIRST = new RegExp(`\\b(${MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi");
const DAY_FIRST = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+(${MONTHS})\\.?,?[\\s-]+(\\d{4})\\b`, "gi");
const NUMERIC = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g;
const ISO = /\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/g;

const AMERICAN: [RegExp, string][] = [
  [/\bcolors?\b/gi, "colour"],
  [/\bfavorites?\b/gi, "favourite"],
  [/\bhonor(s|ed)?\b/gi, "honour"],
  [/\blabor\b/gi, "labour"],
  [/\bbehaviors?\b/gi, "behaviour"],
  [/\bneighbors?\b/gi, "neighbour"],
  [/\b(center|centers)\b/gi, "centre"],
  [/\btheaters?\b/gi, "theatre"],
  [/\bcatalogs?\b/gi, "catalogue"],
  [/\banalyz(e|ed|es|ing)\b/gi, "analyse"],
  [/\bdefense\b/gi, "defence"],
  [/\b(traveled|traveling)\b/gi, "travelled/travelling"],
  [/\b(canceled|canceling)\b/gi, "cancelled/cancelling"],
  [/\benrollments?\b/gi, "enrolment"],
  [/\bfulfill(ment)?\b/gi, "fulfil(ment)"],
  [/\bprogram(s)?\b(?!\s*(code|file))/gi, "programme"],
];

function parseLooseDate(s: string): Date | null {
  s = s.trim();
  let m = s.match(/^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2,4})$/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return new Date(y, +m[2] - 1, +m[1]);
  }
  m = s.match(new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+(${MONTHS})\\.?,?[\\s-]+(\\d{4})$`, "i"));
  if (m) return new Date(`${m[2]} ${m[1]}, ${m[3]}`);
  const d = new Date(s);
  return isNaN(+d) ? null : d;
}

export const contentRules: Rule[] = [
  {
    id: "content.lang",
    title: "Language metadata (lang / hreflang) is set correctly",
    category: CAT,
    section: "7.5.1 ii",
    severity: "major",
    source: "automated",
    run: ({ site }) => {
      const bad: Evidence[] = [];
      for (const p of site.pages) {
        if (!p.lang) {
          bad.push({ page: pageLabel(p), value: "<html> has no lang attribute" });
          continue;
        }
        if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(p.lang)) bad.push({ page: pageLabel(p), value: `invalid lang="${p.lang}"` });
        const deva = (p.bodyText.match(/[ऀ-ॿ]/g) || []).length;
        const latin = (p.bodyText.match(/[A-Za-z]/g) || []).length;
        if (/^en/i.test(p.lang) && deva > latin * 1.5) bad.push({ page: pageLabel(p), value: `lang="${p.lang}" but content is mostly Devanagari` });
        if (/^hi/i.test(p.lang) && latin > deva * 1.5) bad.push({ page: pageLabel(p), value: `lang="${p.lang}" but content is mostly Latin script` });
      }
      const hreflang = site.pages.some((p) => p.hreflangs.length > 0);
      if (bad.length) return { status: "fail", message: "Some pages have missing or incorrect lang attributes.", evidence: cap(bad), fix: 'Set <html lang="en"> (or "hi", etc.) to match the page language.' };
      return {
        status: hreflang ? "pass" : "warn",
        message: hreflang ? "lang is set on every page and hreflang alternates are declared." : "lang is set correctly, but no hreflang alternates are declared for the other language versions.",
        evidence: site.pages[0].hreflangs.map((h) => ({ value: `hreflang="${h}"` })),
        fix: 'Add <link rel="alternate" hreflang="hi" href="…"> for each language version.',
      };
    },
  },
  {
    id: "content.https",
    title: "Pages and links are secure (HTTPS)",
    category: CAT,
    section: "7.1.3.3 ii, A.5.6 x",
    checklist: "F.2 #28",
    severity: "critical",
    source: "automated",
    run: ({ site }) => {
      const insecurePages = site.pages.filter((p) => !p.finalUrl.startsWith("https://"));
      const httpLinks = new Map<string, string>();
      const mixed = new Map<string, string>();
      for (const p of site.pages) {
        for (const l of p.links) if (l.href.startsWith("http://")) httpLinks.set(l.href, pageLabel(p));
        if (p.finalUrl.startsWith("https://")) for (const n of p.network) if (n.url.startsWith("http://")) mixed.set(n.url, pageLabel(p));
      }
      const ev: Evidence[] = [
        ...insecurePages.map((p) => ({ page: pageLabel(p), value: "page served over HTTP" })),
        ...[...mixed].map(([u, pg]) => ({ page: pg, url: u, value: "mixed content (HTTP resource on HTTPS page)" })),
        ...[...httpLinks].map(([u, pg]) => ({ page: pg, url: u, value: "HTTP link" })),
      ];
      const status = insecurePages.length || mixed.size ? "fail" : httpLinks.size ? "warn" : "pass";
      return {
        status,
        message:
          status === "pass"
            ? "All pages use HTTPS and all links point to HTTPS URLs."
            : `${insecurePages.length} page(s) on HTTP, ${mixed.size} mixed-content resource(s), ${httpLinks.size} link(s) to HTTP URLs.`,
        evidence: cap(ev, 15),
        fix: "Serve the site only over HTTPS (with HSTS), load every resource over HTTPS and update links to their https:// versions.",
      };
    },
  },
  {
    id: "content.broken-links",
    title: "Links are valid",
    category: CAT,
    section: "7.1.3.3 ii, A.5.6 x",
    checklist: "F.2 #28",
    severity: "major",
    source: "automated",
    run: ({ site }) => {
      if (!site.links) return { status: "manual", message: "Link checking was disabled for this scan.", evidence: [] };
      // 404/410/5xx are broken; 400/401/403/429/999 usually mean the target blocks automated checks.
      const broken = site.links.filter((l) => l.status !== null && (l.status === 404 || l.status === 410 || l.status >= 500) && l.status !== 999);
      const errors = site.links.filter((l) => l.status === null || (!l.ok && !broken.includes(l)));
      const ev: Evidence[] = [
        ...broken.map((l) => ({ url: l.url, value: `HTTP ${l.status}`, page: shortUrl(l.foundOn, 40) })),
        ...errors.map((l) => ({ url: l.url, value: l.status ? `HTTP ${l.status} (blocked automated check — verify manually)` : l.error || "unreachable", page: shortUrl(l.foundOn, 40) })),
      ];
      return {
        status: broken.length ? "fail" : errors.length > 2 ? "warn" : "pass",
        message: `${site.links.length} unique links checked: ${broken.length} broken, ${errors.length} could not be verified automatically.`,
        evidence: cap(ev, 20),
        fix: "Fix or remove broken links and validate links periodically (e.g. monthly automated link check).",
      };
    },
  },
  {
    id: "content.editable-docs",
    title: "No editable document formats are published",
    category: CAT,
    section: "7.1.3.3, A.5.6 vii",
    checklist: "F.2 #26",
    severity: "major",
    source: "automated",
    run: ({ site }) => {
      const bad = new Map<string, string>();
      const re = new RegExp(`\\.(${EDITABLE_DOC_EXT.join("|")})(\\?|$)`, "i");
      for (const p of site.pages) for (const l of p.links) if (re.test(l.href)) bad.set(l.href, pageLabel(p));
      return {
        status: bad.size ? "fail" : "pass",
        message: bad.size ? `${bad.size} link(s) to editable documents (Word/Excel/PowerPoint) found.` : "No links to editable document formats were found.",
        evidence: cap([...bad].map(([u, pg]) => ({ page: pg, url: u }))),
        fix: "Publish documents, presentations and brochures as accessible (tagged) PDFs only.",
      };
    },
  },
  {
    id: "content.accessible-pdf",
    title: "PDFs are accessible (tagged) and ≤ 5 MB",
    category: CAT,
    section: "7.1.3.3, A.5.3, A.5.6 vii",
    checklist: "F.2 #26",
    severity: "major",
    source: "automated",
    run: ({ site }) => {
      if (!site.pdfs) return { status: "manual", message: "PDF checking was disabled for this scan.", evidence: [] };
      if (!site.pdfs.length) return { status: "na", message: "No linked PDFs were found on the scanned pages.", evidence: [] };
      const analysed = site.pdfs.filter((p) => !p.error);
      const untagged = analysed.filter((p) => !p.tagged || !p.hasStructTree);
      const big = site.pdfs.filter((p) => (p.bytes ?? 0) > DOC_MAX_BYTES);
      const ev: Evidence[] = [
        ...untagged.map((p) => ({ url: p.url, value: `not tagged${p.hasLang ? "" : ", no document language"}${p.hasTitle ? "" : ", no title"}` })),
        ...big.map((p) => ({ url: p.url, value: fmtBytes(p.bytes), expected: "≤ 5 MB (20 MB for brochures)" })),
        ...site.pdfs.filter((p) => p.error).map((p) => ({ url: p.url, value: `could not analyse: ${p.error}` })),
      ];
      return {
        status: untagged.length ? (untagged.length === analysed.length ? "fail" : "warn") : big.length ? "warn" : "pass",
        message: `${analysed.length - untagged.length} of ${analysed.length} analysed PDFs are tagged; ${big.length} exceed 5 MB.`,
        evidence: cap(ev, 15),
        fix: "Export PDFs with tags (structure tree), document language and title set (e.g. “Create tagged PDF” in Word/Acrobat); compress to ≤ 5 MB.",
      };
    },
  },
  {
    id: "content.date-format",
    title: "Dates are written day before month",
    category: CAT,
    section: "A.5.6 viii",
    checklist: "F.2 #27",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const bad: Evidence[] = [];
      let dayFirst = 0;
      for (const p of site.pages) {
        const t = p.bodyText;
        for (const m of t.matchAll(MONTH_FIRST)) bad.push({ page: pageLabel(p), value: m[0] });
        for (const m of t.matchAll(NUMERIC)) {
          const a = +m[1], b = +m[2];
          if (a <= 12 && b > 12 && b <= 31) bad.push({ page: pageLabel(p), value: m[0] });
          else if (a > 12 && a <= 31) dayFirst++;
        }
        for (const m of t.matchAll(ISO)) bad.push({ page: pageLabel(p), value: `${m[0]} (year-month-day)` });
        dayFirst += [...t.matchAll(DAY_FIRST)].length;
      }
      return {
        status: bad.length === 0 ? "pass" : bad.length <= 2 && dayFirst > bad.length * 3 ? "warn" : "fail",
        message: bad.length ? `${bad.length} date(s) are written with the month before the day.` : dayFirst ? `${dayFirst} date(s) found, all day-first.` : "No dates with a detectable order were found.",
        evidence: cap(bad, 12),
        fix: "Write dates day-first, e.g. 14 October 2026 or 14/10/2026.",
      };
    },
  },
  {
    id: "content.british-english",
    title: "English text uses British spelling consistently",
    category: CAT,
    section: "7.1.3.3 i",
    severity: "minor",
    source: "heuristic",
    run: ({ site }) => {
      const hits = new Map<string, { n: number; brit: string }>();
      for (const p of site.pages)
        for (const [re, brit] of AMERICAN)
          for (const m of p.bodyText.matchAll(re)) {
            const k = m[0].toLowerCase();
            const h = hits.get(k) ?? { n: 0, brit };
            h.n++;
            hits.set(k, h);
          }
      const total = [...hits.values()].reduce((s, h) => s + h.n, 0);
      return {
        status: total === 0 ? "pass" : total <= 3 ? "warn" : "fail",
        message: total ? `${total} American spelling(s) found.` : "No common American spellings were found.",
        evidence: [...hits].sort((a, b) => b[1].n - a[1].n).slice(0, 12).map(([w, h]) => ({ value: `"${w}" × ${h.n}`, expected: h.brit })),
        fix: "Use British English throughout (colour, centre, programme, organisation-style spellings) and run a spell-checker set to English (UK/India).",
      };
    },
  },
  {
    id: "content.cookie-consent",
    title: "Cookie consent banner at the bottom with accept, reject and customise",
    category: CAT,
    section: "7.6.1",
    checklist: "F.1 #41",
    severity: "major",
    source: "heuristic",
    run: ({ home }) => {
      const c = home.cookieBanner;
      const tracking = home.cookiesBeforeConsent;
      const ev: Evidence[] = [
        { value: `Banner found: ${c.found ? "yes" : "no"}${c.found ? `, at bottom: ${c.atBottom ? "yes" : "no"}` : ""}` },
        ...(c.found ? [{ value: `Accept: ${c.hasAccept ? "✓" : "✗"}  Reject: ${c.hasReject ? "✓" : "✗"}  Customise: ${c.hasCustomize ? "✓" : "✗"}` }, { value: `"${c.text.slice(0, 160)}"` }] : []),
        ...tracking.map((t) => ({ value: `Tracking cookie "${t.name}" (${t.domain}) set before any consent choice`, note: "DPDP Act 2023" })),
      ];
      let status: "pass" | "warn" | "fail";
      if (!c.found) status = "fail";
      else if (tracking.length) status = "fail";
      else if (c.atBottom && c.hasAccept && c.hasReject && c.hasCustomize) status = "pass";
      else status = "warn";
      return {
        status,
        message: !c.found
          ? `No cookie consent banner was found${tracking.length ? `, and ${tracking.length} tracking cookie(s) are set without consent` : ""}.`
          : tracking.length
            ? `A cookie banner exists, but ${tracking.length} tracking cookie(s) are set before the visitor chooses.`
            : status === "pass"
              ? "Cookie banner is at the bottom with accept, reject and customise options."
              : "Cookie banner found but it is not at the bottom or lacks accept/reject/customise options.",
        evidence: ev,
        fix: "Show a bottom cookie banner (white background) with Accept, Reject and Customise; load analytics and other non-essential cookies only after consent (DPDP Act, 2023).",
      };
    },
  },
  {
    id: "content.ccps",
    title: "Central Content Publishing System (CCPS) is integrated",
    category: CAT,
    section: "7.4, A.4.1.2 ii, xii",
    checklist: "F.1 #39, F.2 #7",
    severity: "major",
    source: "heuristic",
    run: ({ site, home }) => {
      const hits = site.pages.flatMap((p) => p.network.filter((n) => CCPS_HOST_PATTERN.test(n.url)).map((n) => ({ page: pageLabel(p), url: n.url })));
      const homeHits = home.network.filter((n) => CCPS_HOST_PATTERN.test(n.url));
      return {
        status: homeHits.length ? "pass" : hits.length ? "warn" : "fail",
        message: homeHits.length
          ? `The homepage loads ${homeHits.length} resource(s) from the DBIM Toolkit / CCPS.`
          : hits.length
            ? "CCPS content was loaded on an inner page but not on the homepage."
            : "No requests to the DBIM Toolkit CCPS API were seen. (A server-side integration cannot be detected from the browser — verify manually if applicable.)",
        evidence: cap(hits.map((h) => ({ page: h.page, url: h.url }))),
        fix: "Subscribe to CCPS on the DBIM Toolkit and render the full-width CCPS banner as the first homepage carousel item, the overlay banner, and central posts (960×245).",
      };
    },
  },
  {
    id: "content.last-updated",
    title: "Content is up to date (Last Updated On)",
    category: CAT,
    section: "5.6, 7.3",
    checklist: "F.1 #42",
    severity: "minor",
    source: "heuristic",
    run: ({ site }) => {
      const re = /last\s*(?:updated|reviewed|modified)(?:\s*on)?\s*[:\-–]?\s*([0-9]{1,2}(?:st|nd|rd|th)?[\s/.\-][0-9A-Za-z]{1,9}[\s/.\-,]+[0-9]{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/i;
      const found: Evidence[] = [];
      let newest: Date | null = null;
      for (const p of site.pages) {
        const m = (p.footer.text + " " + p.bodyText.slice(-3000)).match(re);
        if (!m) continue;
        const d = parseLooseDate(m[1]);
        found.push({ page: pageLabel(p), value: m[0].replace(/\s+/g, " ") });
        if (d && (!newest || d > newest)) newest = d;
      }
      if (!found.length) return { status: "manual", message: "No parsable “Last Updated On” date was found; confirm content freshness manually.", evidence: [] };
      const days = newest ? Math.floor((Date.now() - +newest) / 86_400_000) : null;
      return {
        status: days === null ? "manual" : days <= 180 ? "pass" : days <= 365 ? "warn" : "fail",
        message: days === null ? "A Last Updated label was found but its date could not be parsed." : `Most recent “Last Updated” date is ${days} day(s) old.`,
        evidence: cap(found),
        fix: "Keep content current and archive outdated content (DBIM §7.3); show the real last-updated date per page.",
      };
    },
  },
  {
    id: "content.video-captions",
    title: "Videos have captions",
    category: CAT,
    section: "A.5.4.2 iii",
    checklist: "F.2 #21",
    severity: "minor",
    source: "heuristic",
    run: ({ site }) => {
      const vids = site.pages.flatMap((p) => p.videos.map((v) => ({ ...v, page: pageLabel(p) })));
      if (!vids.length) return { status: "na", message: "No videos found on the scanned pages.", evidence: [] };
      const native = vids.filter((v) => v.kind === "video");
      const missing = native.filter((v) => !v.hasCaptions);
      const embeds = vids.filter((v) => v.kind === "iframe" && !v.hasCaptions);
      return {
        status: missing.length ? "fail" : embeds.length ? "manual" : "pass",
        message: `${native.length - missing.length}/${native.length} native videos have caption tracks; ${embeds.length} embedded video(s) need a manual caption check.`,
        evidence: cap([...missing.map((v) => ({ page: v.page, selector: v.sel, value: "<video> without captions track" })), ...embeds.map((v) => ({ page: v.page, url: v.src, value: "embedded video — verify captions on the host" }))]),
        fix: 'Add <track kind="captions"> to native videos and upload captions for YouTube videos (cc_load_policy=1 to show them by default).',
      };
    },
  },
  {
    id: "content.seo",
    title: "Pages have titles and meta descriptions",
    category: CAT,
    section: "7.2.2, 7.5.2 g",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const bad: Evidence[] = [];
      const titles = new Map<string, number>();
      for (const p of site.pages) {
        if (!p.title.trim()) bad.push({ page: pageLabel(p), value: "missing <title>" });
        if (!p.metaDescription?.trim()) bad.push({ page: pageLabel(p), value: "missing meta description" });
        titles.set(p.title, (titles.get(p.title) || 0) + 1);
      }
      const dupes = [...titles].filter(([t, n]) => n > 1 && t);
      for (const [t, n] of dupes) bad.push({ value: `"${t.slice(0, 60)}" used as the title of ${n} pages` });
      return {
        status: bad.length === 0 ? "pass" : "warn",
        message: bad.length ? `${bad.length} SEO metadata issue(s) found.` : "Every scanned page has a unique title and a meta description.",
        evidence: cap(bad),
        fix: "Give each page a unique, descriptive <title> and meta description.",
      };
    },
  },
  {
    id: "content.chatbot",
    title: "Chatbot (if any) is a floating button at the bottom right",
    category: "Search",
    section: "9 xiii",
    severity: "minor",
    source: "heuristic",
    run: ({ home }) => {
      if (!home.chatbot.found) return { status: "na", message: "No chatbot detected (optional).", evidence: [] };
      return {
        status: home.chatbot.bottomRight ? "pass" : "warn",
        message: home.chatbot.bottomRight ? "Chatbot launcher is at the bottom right." : "A chatbot is present but not placed at the bottom right.",
        evidence: [],
        fix: "Place the chatbot as a floating button at the bottom-right corner (e.g. NIC VAANI).",
      };
    },
  },
];
