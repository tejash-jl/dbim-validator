import { describe, expect, it } from "vitest";
import { evaluate } from "../src/lib/dbim/engine";
import { DEFAULT_OPTIONS, type PageData, type SiteData } from "../src/lib/dbim/types";
import { pickPages } from "../src/lib/scanner/crawl";

function page(over: Partial<PageData> = {}): PageData {
  const base: PageData = {
    url: "https://example.gov.in/", finalUrl: "https://example.gov.in/", status: 200, title: "Home", lang: "en", hreflangs: ["hi"],
    metaViewport: "width=device-width, initial-scale=1", metaDescription: "desc",
    bodyText: "Published on 14 October 2026. Last Updated On: 01/10/2026",
    desktop: {
      width: 1440, height: 900, scrollWidth: 1440,
      texts: [{ sel: "p", tag: "p", chars: 200, text: "x".repeat(200), fontFamily: '"Noto Sans", sans-serif', fontSize: 16, fontWeight: 400, lineHeight: 24, color: "rgb(21, 2, 2)", bg: "rgb(255, 255, 255)", textAlign: "left", textTransform: "none", inHeader: false, inFooter: false }],
      headings: [{ level: 1, text: "Title", fontSize: 36, fontWeight: 700, fontFamily: "Noto Sans", inHeader: false, inFooter: false }],
      colors: [{ color: "rgb(22, 47, 106)", weight: 0.2, prop: "bg" }, { color: "rgb(255, 255, 255)", weight: 0.7, prop: "bg" }],
    },
    mobile: null, images: [], svgs: [], iconFonts: [], links: [], forms: [], buttons: [], tables: [],
    header: { found: true, sel: null, text: "भारत सरकार Government of India Ministry of Electronics", bg: "rgb(255,255,255)", hasSearch: true, searchWidth: 260, hasSkipLink: true, skipLinkTarget: true, hasLanguageSwitch: true, hasAccessibilityControls: true, hasNav: true, navItems: ["Ministry", "Offerings", "Documents", "Media", "Connect"], stickyAfterScroll: true, emblemCandidates: [{ src: "emblem.svg", alt: "State Emblem of India", width: 40, height: 60, naturalWidth: 0, naturalHeight: 0, objectFit: "fill" }], logoCandidates: [], hasLogin: false },
    footer: { found: true, sel: null, bg: "rgb(22, 47, 106)", text: "This website belongs to Ministry of Electronics and Information Technology, Government of India", links: ["Website Policies", "Sitemap", "Related Links", "Help", "Feedback", "Contact Us", "Last Updated On"].map((t) => ({ text: t, href: "https://example.gov.in/x" })) },
    cookieBanner: { found: true, atBottom: true, hasAccept: true, hasReject: true, hasCustomize: true, text: "We use cookies" },
    cookiesBeforeConsent: [], chatbot: { found: false, bottomRight: false }, videos: [], hover: [], search: { attempted: true, worked: true, note: "ok" },
    network: [], perf: { ttfb: 100, domContentLoaded: 500, load: 900, lcp: 1200, cls: 0.01, transferBytes: 100000 }, axe: [], errors: [],
  };
  return { ...base, ...over };
}

function site(pages: PageData[], orgType = DEFAULT_OPTIONS.orgType): SiteData {
  return { startUrl: pages[0].url, options: { ...DEFAULT_OPTIONS, orgType }, pages, lighthouse: null, links: [], pdfs: [], ai: null };
}

const byId = (r: ReturnType<typeof evaluate>, id: string) => r.results.find((x) => x.id === id)!;

describe("rules engine", () => {
  it("does not let pale tints decide or split the colour group", () => {
    const base = page();
    const p = page({ desktop: { ...base.desktop, colors: [...base.desktop.colors, { color: "#FAEBF2", weight: 0.4, prop: "bg" }] } });
    const r = evaluate(site([p]), { durationMs: 1, notes: [] });
    expect(r.colourGroup).toBe("Blue");
    expect(byId(r, "colours.primary-group").status).toBe("pass");
    expect(byId(r, "colours.primary-group").evidence[0].value).toContain("#162F6A");
  });

  it("passes a compliant page on core checks", () => {
    const r = evaluate(site([page()]), { durationMs: 1, notes: [] });
    expect(r.colourGroup).toBe("Blue");
    for (const id of ["colours.primary-group", "colours.footer", "type.noto-sans", "header.components", "footer.elements", "footer.lineage", "content.date-format", "content.cookie-consent", "min.l1-sections", "header.lockup"])
      expect(byId(r, id).status, id).toBe("pass");
  });

  it("flags mixed colour groups, wrong footer colour and month-first dates", () => {
    const p = page({ bodyText: "Released October 14, 2026", footer: { ...page().footer, bg: "rgb(51, 51, 51)" } });
    p.desktop.colors.push({ color: "#A32966", weight: 0.2, prop: "bg" });
    const r = evaluate(site([p]), { durationMs: 1, notes: [] });
    expect(byId(r, "colours.primary-group").status).toBe("fail");
    expect(byId(r, "colours.footer").status).toBe("fail");
    expect(byId(r, "content.date-format").status).toBe("fail");
  });

  it("fails an emblem on a Lockup 3B organization and skips ministry-only rules", () => {
    const r = evaluate(site([page()], "org-no-emblem"), { durationMs: 1, notes: [] });
    expect(byId(r, "header.lockup").status).toBe("fail");
    expect(r.results.find((x) => x.id === "min.l1-sections")).toBeUndefined();
  });

  it("detects tracking cookies set before consent", () => {
    const r = evaluate(site([page({ cookiesBeforeConsent: [{ name: "_ga", domain: ".example.gov.in" }] })]), { durationMs: 1, notes: [] });
    expect(byId(r, "content.cookie-consent").status).toBe("fail");
  });

  it("treats AI checks as manual review when AI is unavailable", () => {
    const r = evaluate({ ...site([page()]), aiError: "no key" }, { durationMs: 1, notes: [] });
    expect(byId(r, "ai.icon_style").status).toBe("manual");
  });
});

describe("pickPages", () => {
  it("prefers same-site navigation pages and skips files", () => {
    const home = page({
      links: [
        { href: "https://example.gov.in/about-us", text: "About Us", inHeader: true, inFooter: false, inNav: true, title: "" },
        { href: "https://example.gov.in/report.pdf", text: "Report", inHeader: false, inFooter: false, inNav: false, title: "" },
        { href: "https://other.gov.in/x", text: "Other", inHeader: false, inFooter: false, inNav: false, title: "" },
        { href: "https://example.gov.in/contact", text: "Contact", inHeader: false, inFooter: true, inNav: false, title: "" },
      ],
    });
    expect(pickPages(home, 5)).toEqual(["https://example.gov.in/about-us", "https://example.gov.in/contact"]);
  });
});
