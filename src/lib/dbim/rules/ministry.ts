import { MINISTRY_L1_SECTIONS, SOCIAL_DOMAINS } from "../spec";
import type { Evidence, Rule } from "../types";
import { cap, pageLabel } from "./util";

const IA = "Ministry website";
const FORMS = "Forms";

export const ministryRules: Rule[] = [
  {
    id: "min.l1-sections",
    title: "Global navigation has the five mandatory level-1 sections",
    category: IA,
    section: "A.1",
    checklist: "F.2 #1",
    severity: "major",
    source: "heuristic",
    appliesTo: ["ministry"],
    run: ({ home }) => {
      const items = home.header.navItems;
      if (!items.length) return { status: "fail", message: "No global navigation menu items were detected.", evidence: [] };
      const found = MINISTRY_L1_SECTIONS.map((s) => ({ ...s, match: items.find((i) => s.pattern.test(i)) }));
      const missing = found.filter((f) => !f.match);
      return {
        status: missing.length === 0 ? "pass" : missing.length <= 1 ? "warn" : "fail",
        message: missing.length ? `Navigation lacks: ${missing.map((m) => m.label).join(", ")}.` : "All five level-1 sections are present.",
        evidence: [
          { value: `Menu: ${items.join(" · ")}` },
          ...found.map((f) => ({ value: `${f.match ? "✓" : "✗"} ${f.label}${f.match ? ` → "${f.match}"` : ""}` })),
        ],
        fix: "Organise the global menu into Ministry/Department, Offerings, Documents, Media and Connect (DBIM Table 11).",
      };
    },
  },
  {
    id: "min.social",
    title: "Integrated with official social media handles",
    category: IA,
    section: "A.4.1.2 xi, C.3",
    checklist: "F.2 #6",
    severity: "minor",
    source: "automated",
    appliesTo: ["ministry"],
    run: ({ site }) => {
      const found = new Map<string, string>();
      for (const p of site.pages)
        for (const l of p.links) {
          let host = "";
          try {
            host = new URL(l.href).hostname;
          } catch {
            continue;
          }
          for (const [name, re] of Object.entries(SOCIAL_DOMAINS)) if (re.test(host) && !found.has(name)) found.set(name, l.href);
        }
      const core = ["X", "Facebook", "Instagram", "YouTube", "LinkedIn"].filter((n) => found.has(n));
      return {
        status: core.length >= 4 ? "pass" : core.length >= 2 ? "warn" : "fail",
        message: `Links to ${core.length} of the 5 core platforms (X, Facebook, Instagram, YouTube, LinkedIn)${found.has("WhatsApp") ? " plus a WhatsApp channel" : ""}.`,
        evidence: [...found].map(([n, u]) => ({ value: n, url: u })),
        fix: "Link the Ministry's verified X, Facebook, Instagram, YouTube and LinkedIn handles and show a citizen-engagement social feed on the homepage.",
      };
    },
  },
  {
    id: "min.archive",
    title: "Archive section is included",
    category: IA,
    section: "A.5.6 xi",
    checklist: "F.2 #29",
    severity: "minor",
    source: "heuristic",
    appliesTo: ["ministry"],
    run: ({ site }) => {
      const hit = site.pages.flatMap((p) => p.links).find((l) => /archive|पुरालेख/i.test(`${l.text} ${l.href}`));
      return {
        status: hit ? "pass" : "fail",
        message: hit ? "An archive link was found." : "No archive section/link was found.",
        evidence: hit ? [{ value: hit.text, url: hit.href }] : [],
        fix: "Add an Archives section (usually linked from the footer) and move outdated content there with its archival date.",
      };
    },
  },
  {
    id: "min.title-length",
    title: "Offering and document titles are within length limits",
    category: IA,
    section: "A.5.2, A.5.3",
    checklist: "F.2 #16, #20",
    severity: "minor",
    source: "heuristic",
    appliesTo: ["ministry"],
    run: ({ site }) => {
      const bad: Evidence[] = [];
      for (const p of site.pages) for (const l of p.links) if (l.text.length > 150 && !l.inFooter) bad.push({ page: pageLabel(p), value: `${l.text.length} chars: "${l.text.slice(0, 60)}…"`, expected: "≤ 150 (offerings) / ≤ 250 (documents)" });
      return {
        status: bad.length === 0 ? "pass" : bad.some((b) => parseInt(b.value!) > 250) ? "fail" : "warn",
        message: bad.length ? `${bad.length} linked title(s) exceed 150 characters.` : "No linked titles exceed 150 characters.",
        evidence: cap(bad),
        fix: "Keep offering titles ≤ 150 characters and document/media titles ≤ 250 characters.",
      };
    },
  },
  {
    id: "min.pm-quote-text",
    title: "PM quote is present on the homepage",
    category: IA,
    section: "A.4.1.2 iv",
    checklist: "F.2 #10",
    severity: "minor",
    source: "heuristic",
    appliesTo: ["ministry"],
    run: ({ home }) => {
      const m = home.bodyText.match(/(prime\s+minister|narendra\s+modi|प्रधानमंत्री|प्रधान\s+मंत्री)[^\n]{0,120}/i);
      return {
        status: m ? "pass" : "fail",
        message: m ? "The homepage references the Prime Minister (likely the PM quote section). Format is assessed separately." : "No Prime Minister quote section was detected on the homepage.",
        evidence: m ? [{ value: `"${m[0].slice(0, 140)}"` }] : [],
        fix: "Add the PM Quote section with a sector-relevant quote, event and date, sourced from pmindia.gov.in or the DBIM Toolkit.",
      };
    },
  },
];

export const formRules: Rule[] = [
  {
    id: "forms.labels",
    title: "Form fields have clickable labels",
    category: FORMS,
    section: "B ix",
    checklist: "F.2 #34",
    severity: "major",
    source: "automated",
    run: ({ site }) => {
      const fields = site.pages.flatMap((p) => p.forms.flatMap((f) => f.fields.map((x) => ({ ...x, page: pageLabel(p) }))));
      if (!fields.length) return { status: "na", message: "No forms (other than search) were found on the scanned pages.", evidence: [] };
      const bad = fields.filter((f) => !f.clickableLabel);
      const unlabelled = fields.filter((f) => !f.labelled);
      return {
        status: unlabelled.length ? "fail" : bad.length ? "warn" : "pass",
        message: `${fields.length - bad.length} of ${fields.length} fields have a <label> linked to them; ${unlabelled.length} have no accessible name at all.`,
        evidence: cap(bad.map((f) => ({ page: f.page, selector: f.sel, value: f.labelled ? "labelled via aria/title only (label not clickable)" : "no label" }))),
        fix: 'Use <label for="fieldId"> (or wrap the input in <label>) for every field, positioned above the field.',
      };
    },
  },
  {
    id: "forms.required",
    title: "Mandatory fields are marked with * or “Required”",
    category: FORMS,
    section: "B iv",
    checklist: "F.2 #33",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const req = site.pages.flatMap((p) => p.forms.flatMap((f) => f.fields.filter((x) => x.required).map((x) => ({ ...x, page: pageLabel(p) }))));
      if (!req.length) return { status: "na", message: "No fields marked as required in markup were found.", evidence: [] };
      const bad = req.filter((f) => !f.requiredMarked);
      return {
        status: bad.length ? "fail" : "pass",
        message: `${req.length - bad.length} of ${req.length} required fields are visibly marked.`,
        evidence: cap(bad.map((f) => ({ page: f.page, selector: f.sel }))),
        fix: "Add an asterisk (*) or the word “Required” to the label of every mandatory field.",
      };
    },
  },
  {
    id: "forms.instructions",
    title: "Forms start with filling instructions",
    category: FORMS,
    section: "B i",
    checklist: "F.2 #31",
    severity: "minor",
    source: "heuristic",
    run: ({ site }) => {
      const forms = site.pages.flatMap((p) => p.forms.filter((f) => f.fields.length >= 3 && !f.isFilter).map((f) => ({ ...f, page: pageLabel(p) })));
      if (!forms.length) return { status: "na", message: "No multi-field forms were found.", evidence: [] };
      const bad = forms.filter((f) => f.introText.length < 20);
      return {
        status: bad.length ? "warn" : "pass",
        message: `${forms.length - bad.length} of ${forms.length} forms begin with instructions.`,
        evidence: cap(bad.map((f) => ({ page: f.page, selector: f.sel, value: f.introText ? `"${f.introText}"` : "no text before the first field" }))),
        fix: "Begin each form with short instructions (what is needed, which fields are mandatory).",
      };
    },
  },
];
