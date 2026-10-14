import type { OrgType } from "../spec";
import type { Rule, Severity } from "../types";
import type { AiCheckKey } from "../../scanner/ai";

type AiRuleDef = { key: AiCheckKey; title: string; category: string; section: string; checklist?: string; severity: Severity; appliesTo?: OrgType[] };

const AI_RULES: AiRuleDef[] = [
  { key: "logo_lockup", title: "Logo lockup and emblem colour suit the organization and background", category: "Header & Footer", section: "5.2, 5.3", checklist: "F.1 #22, #23", severity: "major" },
  { key: "emblem_integrity", title: "Emblem and logos are accurate and not manipulated", category: "Logo", section: "5.1, 5.5", checklist: "F.1 #26", severity: "major" },
  { key: "header_layout", title: "Header layout follows the DBIM generic header", category: "Header & Footer", section: "5.4", checklist: "F.1 #23", severity: "minor" },
  { key: "icon_style", title: "Icons follow one consistent style (line or filled)", category: "Iconography", section: "3.3", checklist: "F.1 #5", severity: "minor" },
  { key: "icon_labels", title: "Significant icons have text labels and are recognisable", category: "Iconography", section: "3.8", severity: "minor" },
  { key: "banner_text", title: "Banner text is HTML text, not part of the image", category: "Accessibility", section: "8.1", severity: "major" },
  { key: "imagery", title: "Images have no third-party watermarks and good quality", category: "Imagery", section: "6.1.3, 6.2", checklist: "F.1 #36", severity: "minor" },
  { key: "headshots", title: "Headshots follow DBIM (white background, 1:1, face ~50%)", category: "Imagery", section: "6.1.4", checklist: "F.1 #37", severity: "minor" },
  { key: "plain_language", title: "Writing is concise, impartial and plain", category: "Content", section: "7.1.3", severity: "minor" },
  { key: "language_quality", title: "Text is free of errors and Hinglish", category: "Content", section: "7.1.3.3", checklist: "F.1 #38", severity: "major" },
  { key: "pm_quote", title: "PM quote section follows the prescribed format", category: "Ministry website", section: "A.4.1.2 iv", checklist: "F.2 #8, #9, #11", severity: "minor", appliesTo: ["ministry"] },
  { key: "persona_section", title: "Homepage has persona-based navigation", category: "Ministry website", section: "A.2", checklist: "F.2 #2, #3", severity: "minor", appliesTo: ["ministry"] },
  { key: "homepage_sections", title: "Homepage contains the DBIM content sections", category: "Ministry website", section: "A.4.1.2", checklist: "F.2 #5", severity: "major", appliesTo: ["ministry"] },
];

export const aiRules: Rule[] = AI_RULES.map((d) => ({
  id: `ai.${d.key}`,
  title: d.title,
  category: d.category,
  section: d.section,
  checklist: d.checklist,
  severity: d.severity,
  source: "ai",
  appliesTo: d.appliesTo,
  run: ({ site }) => {
    if (!site.ai) {
      return {
        status: "manual",
        source: "manual",
        message: site.aiError ? `Needs visual review — AI assessment unavailable (${site.aiError}).` : "Needs visual review (AI assessment was not enabled for this scan).",
        evidence: [],
      };
    }
    const a = site.ai.find((x) => x.key === d.key);
    if (!a) return { status: "manual", source: "manual", message: "Needs visual review (no AI assessment returned).", evidence: [] };
    return {
      status: a.status === "unclear" ? "manual" : a.status,
      message: a.explanation,
      evidence: [],
      confidence: a.confidence,
    };
  },
}));

type ManualDef = { id: string; title: string; category: string; section: string; checklist: string; severity: Severity; appliesTo?: OrgType[]; how: string };

const MANUAL: ManualDef[] = [
  { id: "manual.icon-toolkit", title: "Icons come from the DBIM Toolkit library", category: "Iconography", section: "3.5", checklist: "F.1 #6", severity: "minor", how: "Compare icons with the Visual Components Library on dbimtoolkit.digifootprint.gov.in." },
  { id: "manual.icon-contrast", title: "Icons on images/banners have sufficient contrast", category: "Iconography", section: "3.7 v", checklist: "F.1 #10", severity: "minor", how: "Check icons placed over photos; use an 80% black overlay with white icons where needed." },
  { id: "manual.emblem-source", title: "State Emblem obtained from an authorised source", category: "Header & Footer", section: "5.1", checklist: "F.1 #19", severity: "major", appliesTo: ["ministry", "org-emblem"], how: "Confirm the emblem artwork comes from the DBIM Toolkit / MHA and is used per the State Emblem of India (Regulation of Use) Rules, 2007." },
  { id: "manual.button-states", title: "Buttons have distinct enabled, hover, focus and disabled states", category: "Typography", section: "4.5 i", checklist: "F.1 #17", severity: "minor", how: "Tab through buttons to see the focus state and inspect disabled buttons (hover is tested automatically)." },
  { id: "manual.thumbnails", title: "Thumbnails provided for high-resolution images, with view/download option", category: "Imagery", section: "6.1.1", checklist: "F.1 #35", severity: "minor", how: "Open the photo gallery and confirm thumbnails link to the original high-resolution image." },
  { id: "manual.permissions", title: "Images used with permission and licences", category: "Imagery", section: "6.1.3", checklist: "F.1 #36", severity: "major", how: "Confirm usage rights for each image and consent from people featured prominently." },
  { id: "manual.consent-language", title: "Personalisation consent is requested in the user's preferred language", category: "Content", section: "7.6.1 i", checklist: "F.1 #40", severity: "minor", how: "Switch language and confirm the consent banner and cookie settings are translated." },
  { id: "manual.search-relevance", title: "Search covers HTML, PDF and image metadata with relevant results", category: "Search", section: "9 vi", checklist: "F.1 #44", severity: "minor", how: "Search for a known PDF title and a known image caption and confirm both are returned." },
  { id: "manual.tagging", title: "Content carries metadata, persona tags and keywords", category: "Search", section: "A.3", checklist: "F.1 #45, F.2 #4", severity: "minor", how: "Review CMS content types for information-type and persona tags." },
  { id: "manual.objectives-list", title: "Objectives and functions are displayed as a list", category: "Ministry website", section: "A.5.1.1", checklist: "F.2 #12", severity: "minor", appliesTo: ["ministry"], how: "Open About Us and confirm objectives/functions are a bulleted list." },
  { id: "manual.names", title: "Minister names/portfolios, hierarchy and organization names are correct", category: "Ministry website", section: "A.5.1.2, A.5.1.3", checklist: "F.2 #13–15", severity: "major", appliesTo: ["ministry"], how: "Verify Our Team and Our Organizations against the current Cabinet list and organogram." },
  { id: "manual.offering-images", title: "Offering card images ≤ 100 KB; tenders link to the portal with valid IDs", category: "Ministry website", section: "A.5.2.1, A.5.2.3", checklist: "F.2 #17, #18", severity: "minor", appliesTo: ["ministry"], how: "Check the Schemes/Tenders pages (thumbnail sizes are also checked automatically on scanned pages)." },
  { id: "manual.versioning", title: "Periodic documents are versioned with release date", category: "Ministry website", section: "A.5.3", checklist: "F.2 #19", severity: "minor", appliesTo: ["ministry"], how: "Open Reports and confirm annual/monthly documents show version and release date." },
  { id: "manual.contacts", title: "CIO, WIM, Appellate Authority and PIO contacts are accurate; geotagging correct", category: "Ministry website", section: "A.5.5", checklist: "F.2 #22, #23", severity: "major", appliesTo: ["ministry"], how: "Verify the Contact/Directory pages and the map location." },
  { id: "manual.workflow", title: "Content goes through a multi-level (≥ 2) CMS approval workflow", category: "Ministry website", section: "A.5.6 iii", checklist: "F.2 #24", severity: "major", appliesTo: ["ministry"], how: "Confirm the CMS workflow configuration with the Web Information Manager." },
  { id: "manual.titles-seniority", title: "Honorifics are uniform and listings are ordered by seniority", category: "Ministry website", section: "A.5.6 v, vi", checklist: "F.2 #25, #30", severity: "minor", appliesTo: ["ministry"], how: "Check Minister/officer listings for uniform Dr./Shri/Smt. and seniority order." },
  { id: "manual.keyboard-forms", title: "Forms are fully keyboard operable", category: "Forms", section: "B vi", checklist: "F.2 #32", severity: "major", how: "Complete each form using only the keyboard (Tab, Shift+Tab, Space, Enter)." },
];

export const manualRules: Rule[] = MANUAL.map((m) => ({
  id: m.id,
  title: m.title,
  category: m.category,
  section: m.section,
  checklist: m.checklist,
  severity: m.severity,
  source: "manual",
  appliesTo: m.appliesTo,
  run: () => ({ status: "manual", message: m.how, evidence: [] }),
}));
