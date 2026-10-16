import { FOOTER_ELEMENTS, LINEAGE_PATTERN, LOGO_FORMATS, LOGO_MAX_BYTES, ORG_TYPES } from "../spec";
import type { Evidence, PageData, Rule } from "../types";
import { cap, extOf, fmtBytes, imageBytes, isDistorted, isLogoImage, pageLabel, shortUrl } from "./util";

const HF = "Header & Footer";

function footerHaystack(p: PageData) {
  return `${p.footer.text} ${p.footer.links.map((l) => `${l.text} ${l.href}`).join(" ")}`;
}

export const headerFooterRules: Rule[] = [
  {
    id: "header.components",
    title: "Header has search, skip link, language selection, accessibility controls and global navigation",
    category: HF,
    section: "5.4",
    checklist: "F.1 #24",
    severity: "critical",
    source: "heuristic",
    run: ({ home }) => {
      const h = home.header;
      const items: [string, boolean, string][] = [
        ["Search bar (engagement bar)", h.hasSearch, "§5.4 i, §9 v"],
        ["Skip to main content", h.hasSkipLink, "§5.4 i"],
        ["Language selection", h.hasLanguageSwitch, "§5.4 i, §7.5.1 i"],
        ["Accessibility controls", h.hasAccessibilityControls, "§5.4 i, Figure 44"],
        ["Global navigation menu", h.hasNav, "§5.4 i"],
      ];
      const missing = items.filter((i) => !i[1]);
      const ev: Evidence[] = items.map(([label, ok, sec]) => ({ value: `${ok ? "✓" : "✗"} ${label}`, note: sec }));
      if (h.hasSkipLink && !h.skipLinkTarget) ev.push({ value: "Skip link target id does not exist on the page", note: "§5.4 i" });
      return {
        status: missing.length === 0 ? (h.hasSkipLink && !h.skipLinkTarget ? "warn" : "pass") : missing.length === 1 ? "warn" : "fail",
        message: missing.length ? `Header is missing: ${missing.map((m) => m[0]).join(", ")}.` : "All fixed header components were found.",
        evidence: ev,
        fix: "Add the fixed header components from DBIM §5.4: search bar, “Skip to main content” link (first focusable element), language selector (e.g. “अ | A”), accessibility controls (text size, contrast) and the global navigation menu.",
      };
    },
  },
  {
    id: "header.lockup",
    title: "Logo lockup and naming match the organization type",
    category: HF,
    section: "5.2, 5.4",
    checklist: "F.1 #21, #23",
    severity: "major",
    source: "heuristic",
    run: ({ home, orgType }) => {
      const h = home.header;
      const text = h.text;
      const hasEmblem = h.emblemCandidates.length > 0;
      const goi = /government\s+of\s+india|भारत\s*सरकार|govt\.?\s+of\s+india/i.test(text);
      const ministry = /ministry\s+of|department\s+of|मंत्रालय|विभाग/i.test(text);
      const ev: Evidence[] = [
        { value: `State Emblem detected: ${hasEmblem ? h.emblemCandidates.map((e) => `${e.alt || (e.src.startsWith("data:") ? "embedded image" : shortUrl(e.src, 40))}${e.detectedBy && e.detectedBy !== "name" ? ` (recognised by ${e.detectedBy})` : ""}`).join(", ") : "no"}` },
        { value: `"Government of India" in header: ${goi ? "yes" : "no"}` },
        { value: `Ministry/Department name in header: ${ministry ? "yes" : "no"}` },
      ];
      const expected = `${ORG_TYPES[orgType].lockup} (${ORG_TYPES[orgType].header})`;
      if (orgType === "ministry") {
        const ok = goi && ministry;
        return {
          status: ok && hasEmblem ? "pass" : ok ? "warn" : "fail",
          message: ok
            ? hasEmblem
              ? `Header shows the State Emblem with "Government of India" and the Ministry/Department name (${expected}).`
              : `Header names the Ministry and "Government of India", but the State Emblem image could not be identified — verify it is present.`
            : `Header does not show the ${expected} text: State Emblem + "Government of India" + Ministry/Department name.`,
          evidence: ev,
          fix: 'Use Logo Lockup 2: State Emblem, "Government of India" and the Ministry/Department name in one language (Hindi on language switch).',
        };
      }
      if (orgType === "org-emblem")
        return {
          status: hasEmblem ? "pass" : "warn",
          message: hasEmblem ? `State Emblem found alongside the organization logo (${expected}).` : `Could not identify the State Emblem in the header; ${expected} requires it next to the organization logo and name.`,
          evidence: ev,
          fix: "Use Logo Lockup 3A: State Emblem + organization logo and name (tagline optional).",
        };
      const byName = h.emblemCandidates.some((e) => !e.detectedBy || e.detectedBy === "name");
      return {
        status: hasEmblem ? (byName ? "fail" : "warn") : "pass",
        message: hasEmblem
          ? `An image that looks like the State Emblem is in the header, but organizations not authorised to use it must use ${expected}.`
          : `No State Emblem in the header, as required for ${expected}.`,
        evidence: ev,
        fix: "Use Logo Lockup 3B: organization logo and name only. Check the State Emblem of India (Regulation of Use) Rules, 2007.",
      };
    },
  },
  {
    id: "header.emblem-proportion",
    title: "State Emblem is in proper ratio",
    category: HF,
    section: "5.1",
    checklist: "F.1 #20",
    severity: "major",
    source: "automated",
    appliesTo: ["ministry", "org-emblem"],
    run: ({ home }) => {
      const em = home.header.emblemCandidates.filter((e) => e.naturalWidth > 0);
      if (!em.length) return { status: "manual", message: "Emblem dimensions could not be measured (not found, or drawn as inline SVG). Check visually.", evidence: [] };
      const bad = em.filter((e) => isDistorted(e, 0.03));
      return {
        status: bad.length ? "fail" : "pass",
        message: bad.length
          ? bad.some((e) => e.detectedBy?.includes("inside the logo image"))
            ? "The logo image that contains the State Emblem is stretched, so the emblem is distorted too."
            : "The State Emblem is displayed with a distorted aspect ratio."
          : "The State Emblem keeps its original aspect ratio.",
        evidence: em.map((e) => ({ url: e.src, value: `source ${e.naturalWidth}×${e.naturalHeight}, shown ${Math.round(e.width)}×${Math.round(e.height)}` })),
        fix: "Set only the emblem's height (width: auto) so it scales proportionally.",
      };
    },
  },
  {
    id: "header.cobranding",
    title: "At most 2 co-branding logos in the header",
    category: HF,
    section: "5.4 ii",
    severity: "minor",
    source: "heuristic",
    run: ({ home }) => {
      const logos = home.header.logoCandidates;
      const cobrand = Math.max(0, logos.length - 1); // first logo is the organization's own lockup
      return {
        status: cobrand <= 2 ? "pass" : "warn",
        message: `${logos.length} logo image(s) found in the header (${cobrand} likely co-branding).`,
        evidence: logos.map((l) => ({ url: l.src, value: l.alt || "(no alt)" })),
        fix: "Show a maximum of 2 co-branding logos (flagship programmes, events) in the header; move others to a dedicated logo section.",
      };
    },
  },
  {
    id: "header.search-length",
    title: "Search box has sufficient length",
    category: "Search",
    section: "9 v",
    severity: "minor",
    source: "automated",
    run: ({ home }) => {
      if (!home.header.hasSearch) return { status: "na", message: "No search box found (see the search presence check).", evidence: [] };
      const w = home.header.searchWidth;
      if (!w) return { status: "warn", message: "Search is behind an icon/toggle; DBIM headers 2 and 3 call for a highlighted, visible search bar.", evidence: [] };
      return {
        status: w >= 200 ? "pass" : "warn",
        message: `Visible search input is ${w}px wide.`,
        evidence: [{ value: `${w}px`, expected: "≥ 200px" }],
        fix: "Make the header search bar wide enough for typical queries (≈ 250px or more on desktop).",
      };
    },
  },
  {
    id: "header.every-page",
    title: "Header and footer appear on every page",
    category: HF,
    section: "A.4.1.2 i, xv",
    severity: "major",
    source: "heuristic",
    run: ({ site }) => {
      const noHeader = site.pages.filter((p) => !p.header.hasNav && !p.header.found);
      const noFooter = site.pages.filter((p) => !p.footer.found);
      const navSig = (p: PageData) => p.header.navItems.slice(0, 6).join("|").toLowerCase();
      const homeSig = navSig(site.pages[0]);
      const diffNav = site.pages.slice(1).filter((p) => homeSig && navSig(p) && navSig(p) !== homeSig);
      const ev: Evidence[] = [
        ...noHeader.map((p) => ({ page: pageLabel(p), value: "no header/navigation detected" })),
        ...noFooter.map((p) => ({ page: pageLabel(p), value: "no footer detected" })),
        ...diffNav.map((p) => ({ page: pageLabel(p), value: `navigation differs from homepage: ${p.header.navItems.slice(0, 6).join(", ")}` })),
      ];
      return {
        status: noHeader.length + noFooter.length === 0 ? (diffNav.length ? "warn" : "pass") : "fail",
        message: `${site.pages.length - noHeader.length}/${site.pages.length} pages have the header and ${site.pages.length - noFooter.length}/${site.pages.length} have the footer.`,
        evidence: cap(ev),
        fix: "Render the same DBIM header (with global navigation) and footer on every page.",
      };
    },
  },
  {
    id: "header.sticky",
    title: "Header / navigation stays sticky while scrolling",
    category: HF,
    section: "A.4.1.2 i",
    severity: "minor",
    source: "automated",
    appliesTo: ["ministry"],
    run: ({ home }) => {
      const s = home.header.stickyAfterScroll;
      if (s === null) return { status: "error", message: "Sticky behaviour could not be measured.", evidence: [] };
      return {
        status: s ? "pass" : "warn",
        message: s ? "The header/navigation stays pinned to the top after scrolling." : "The header/navigation scrolls away; DBIM asks for it to stay sticky.",
        evidence: [],
        fix: "Use position: sticky; top: 0 on the header or navigation bar.",
      };
    },
  },
  {
    id: "footer.elements",
    title: "Footer contains all mandatory information elements",
    category: HF,
    section: "5.6",
    checklist: "F.1 #25",
    severity: "critical",
    source: "heuristic",
    run: ({ site, home }) => {
      const pages = site.pages.filter((p) => p.footer.found);
      if (!pages.length) return { status: "fail", message: "No footer was detected.", evidence: [], fix: "Add a footer containing the DBIM §5.6 elements." };
      // An element counts if it appears in the homepage footer (the template is shared).
      const hay = footerHaystack(home.footer.found ? home : pages[0]);
      const results = FOOTER_ELEMENTS.map((e) => ({ ...e, ok: e.pattern.test(hay) }));
      const missing = results.filter((r) => r.mandatory && !r.ok);
      return {
        status: missing.length === 0 ? "pass" : missing.length === 1 ? "warn" : "fail",
        message: missing.length ? `Footer is missing: ${missing.map((m) => m.label).join(", ")}.` : "All mandatory footer elements were found.",
        evidence: results.map((r) => ({ value: `${r.ok ? "✓" : r.mandatory ? "✗" : "–"} ${r.label}${r.mandatory ? "" : " (optional)"}` })),
        fix: "Footer must include Website Policies, Sitemap, Related Links, Help, Feedback, Contact Us and Last Updated On (Archives and Social Media links optional).",
      };
    },
  },
  {
    id: "footer.lineage",
    title: "Footer states the organization's lineage",
    category: HF,
    section: "5.6",
    checklist: "F.1 #25",
    severity: "major",
    source: "heuristic",
    run: ({ home }) => {
      const text = home.footer.text || home.bodyText.slice(-4000);
      const m = text.match(LINEAGE_PATTERN);
      return {
        status: m ? "pass" : "fail",
        message: m ? "Footer contains a lineage statement." : "No lineage statement such as “The website belongs to Ministry of …, Government of India” was found in the footer.",
        evidence: m ? [{ value: `"${m[0].replace(/\s+/g, " ").slice(0, 200)}"` }] : [],
        fix: "Add the lineage line: “The website belongs to <Department>, <Ministry>, Government of India” (or for PSUs: “This is the official Website of <Org>, a Public Sector Undertaking of the Government of India under the Ministry of …”).",
      };
    },
  },
];

export const logoRules: Rule[] = [
  {
    id: "logo.format",
    title: "Logos are JPEG/JPG, PNG, SVG or WEBP",
    category: "Logo",
    section: "5.5 iii",
    checklist: "F.1 #28",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const logos = site.pages.flatMap((p) => p.images.filter(isLogoImage).map((i) => ({ ...i, page: pageLabel(p) })));
      const uniq = [...new Map(logos.map((l) => [l.src, l])).values()];
      if (!uniq.length) return { status: "na", message: "No logo images were detected.", evidence: [] };
      const bad = uniq.filter((l) => {
        const e = extOf(l.src, imageBytes(site, l.src).mime);
        return e && !LOGO_FORMATS.includes(e);
      });
      return {
        status: bad.length ? "fail" : "pass",
        message: bad.length ? `${bad.length} of ${uniq.length} logos use a disallowed format.` : `All ${uniq.length} logos use an allowed format.`,
        evidence: cap(bad.map((l) => ({ page: l.page, url: l.src, value: extOf(l.src, imageBytes(site, l.src).mime).toUpperCase() }))),
        fix: "Export logos as SVG (preferred), PNG, WEBP or JPG.",
      };
    },
  },
  {
    id: "logo.size",
    title: "Logos are under 100 KB",
    category: "Logo",
    section: "5.5 iv",
    checklist: "F.1 #29",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const logos = [...new Map(site.pages.flatMap((p) => p.images.filter(isLogoImage).map((i) => [i.src, { ...i, page: pageLabel(p) }] as const))).values()];
      const measured = logos.map((l) => ({ ...l, bytes: imageBytes(site, l.src).bytes })).filter((l) => l.bytes != null && !l.src.startsWith("data:"));
      if (!measured.length) return { status: "na", message: "No logo file sizes could be measured.", evidence: [] };
      const bad = measured.filter((l) => l.bytes! > LOGO_MAX_BYTES);
      return {
        status: bad.length ? "fail" : "pass",
        message: bad.length ? `${bad.length} of ${measured.length} logos exceed 100 KB.` : `All ${measured.length} measured logos are under 100 KB.`,
        evidence: cap(bad.map((l) => ({ page: l.page, url: l.src, value: fmtBytes(l.bytes), expected: "< 100 KB" }))),
        fix: "Optimise logos (SVG, or compressed PNG/WEBP at the displayed size).",
      };
    },
  },
  {
    id: "logo.proportion",
    title: "Logos are not scaled disproportionately",
    category: "Logo",
    section: "5.5 ii",
    checklist: "F.1 #27",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const logos = site.pages.flatMap((p) => p.images.filter((i) => isLogoImage(i) && i.naturalWidth > 0).map((i) => ({ ...i, page: pageLabel(p) })));
      if (!logos.length) return { status: "na", message: "No raster logos with known dimensions were found.", evidence: [] };
      const bad = logos.filter((i) => isDistorted(i));
      return {
        status: bad.length ? "fail" : "pass",
        message: bad.length ? `${bad.length} logo(s) are stretched or squashed.` : `All ${logos.length} logos keep their proportions.`,
        evidence: cap(bad.map((i) => ({ page: i.page, url: i.src, value: `source ${i.naturalWidth}×${i.naturalHeight}, shown ${Math.round(i.width)}×${Math.round(i.height)}` }))),
        fix: "Size logos by height only (width: auto) or use object-fit: contain.",
      };
    },
  },
];
