// Machine-readable values from the Digital Brand Identity Manual (DBIM) v3.0,
// MeitY / NIC. Section numbers refer to the manual.

export const DBIM_VERSION = "3.0 (January 2025)";
export const DBIM_SOURCE_URL =
  "https://dbimtoolkit.digifootprint.gov.in/static/uploads/2026/09/405f7c961cef45c6689002aed6f8e08c.pdf";

/** §2.1 Figure 1 — primary colour groups, darkest (key colour) first. */
export const PRIMARY_PALETTE: Record<string, string[]> = {
  Burgundy: ["#6C1340", "#A32966", "#DB70A6", "#EBADCC", "#FAEBF2"],
  Purple: ["#29136C", "#4729A3", "#8B70DB", "#BDADEB", "#EEEBFA"],
  Blue: ["#162F6A", "#214AAB", "#5279D7", "#A3BBF3", "#D2DFFF"],
  Green: ["#0F5757", "#2D8686", "#75BDBD", "#A6D9D9", "#D9F2F2"],
  "Chrome Yellow": ["#5D3E00", "#916100", "#DDA73A", "#F4D390", "#FFEECC"],
  "Cinnamon Red": ["#771D1D", "#A72626", "#D75151", "#FAAAAA", "#FCDADA"],
};

/** §2.2 Table 1 — functional palette. (The manual prints Deep Blue as "#1DOA69"; the letter O is a typo for zero.) */
export const FUNCTIONAL_PALETTE: Record<string, string> = {
  Linen: "#EBEAEA",
  "Inclusive White": "#FFFFFF",
  "Deep Earthy Brown": "#150202",
  Black: "#000000",
  "Deep Blue": "#1D0A69",
  "Liberty Green": "#198754",
  "Mustard Yellow": "#FFC107",
  "Coral Red": "#DC3545",
  Blue: "#0D6EFD",
  "Grey 01": "#C6C6C6",
  "Grey 02": "#8E8E8E",
  "Grey 03": "#606060",
};

/** §3.4 / F.1 #8 — allowed icon sizes in px (including 2px padding). */
export const ICON_SIZES = [24, 32, 48, 64];
/** §3.7 — allowed icon formats. */
export const ICON_FORMATS = ["png", "webp", "svg"];
/** §5.5 — allowed logo formats and max size. */
export const LOGO_FORMATS = ["jpg", "jpeg", "png", "svg", "webp"];
export const LOGO_MAX_BYTES = 100 * 1024;
/** §6.1.1 Table 6/7 — image budgets and formats. */
export const IMAGE_LIMITS = {
  background: 500 * 1024,
  banner: 500 * 1024,
  thumbnail: 100 * 1024,
  highRes: 5 * 1024 * 1024,
};
export const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp"];
/** §6.1.2 */
export const ALT_TEXT_MAX = 140;
export const ALT_TEXT_BANNED = /^(image|picture|photo|img|graphic|pic)(\s+of\b|$|[\s._-]*\d*$)/i;
/** §A.5.3 / A.5.2.3 — recommended document size. */
export const DOC_MAX_BYTES = 5 * 1024 * 1024;
export const BROCHURE_MAX_BYTES = 20 * 1024 * 1024;

/** §4.3.1 / §4.3.2 — type scale in px. */
export const TYPE_SCALE = {
  desktop: { h1: 36, h2: 24, h3: 20, p1: 16, p2: 14, small: 12 },
  mobile: { h1: 24, h2: 20, h3: 16, p1: 14, p2: 12, small: 10 },
} as const;
/** Figure 15 — Regular, Medium, Semi Bold, Bold. */
export const ALLOWED_WEIGHTS = [400, 500, 600, 700];
/** §4.5 iii */
export const LINE_HEIGHT_RANGE = [1.2, 1.5] as const;

/** §5.6 — mandatory footer elements, with keyword patterns used to detect them. */
export const FOOTER_ELEMENTS: { key: string; label: string; pattern: RegExp; mandatory: boolean }[] = [
  { key: "policies", label: "Website Policies", pattern: /website\s*polic|terms\s*(of|&|and)|privacy|hyperlink\s*polic|copyright\s*polic|वेबसाइट\s*नीति/i, mandatory: true },
  { key: "sitemap", label: "Sitemap", pattern: /site\s*-?\s*map|साइट\s*मैप/i, mandatory: true },
  { key: "related", label: "Related Links", pattern: /related\s*links|important\s*links|useful\s*links|संबंधित\s*लिंक/i, mandatory: true },
  { key: "help", label: "Help", pattern: /\bhelp\b|\bfaqs?\b|सहायता/i, mandatory: true },
  { key: "feedback", label: "Feedback", pattern: /feedback|प्रतिक्रिया/i, mandatory: true },
  { key: "contact", label: "Contact Us", pattern: /contact|संपर्क/i, mandatory: true },
  { key: "lastUpdated", label: "Last Updated On", pattern: /last\s*(updated|reviewed|modified)|updated\s*on|अंतिम\s*अद्यतन/i, mandatory: true },
  { key: "archives", label: "Archives", pattern: /archive|पुरालेख/i, mandatory: false },
];

/** §5.6 — lineage statement. */
export const LINEAGE_PATTERN =
  /(web\s*site\s+belongs?\s+to|official\s+web\s*site\s+of|this\s+(web)?site\s+(is\s+)?(owned|maintained|managed)\s+by)[\s\S]{0,200}government\s+of\s+india|(वेबसाइट|वेब\s*साइट)[\s\S]{0,200}भारत\s+सरकार/i;

/** §A.1 — mandatory level-1 navigation sections for Ministry/Department websites. */
export const MINISTRY_L1_SECTIONS: { label: string; pattern: RegExp }[] = [
  { label: "Ministry/Department (About)", pattern: /ministry|department|about|मंत्रालय|विभाग|हमारे\s*बारे/i },
  { label: "Offerings", pattern: /offering|schemes?|services|सेवाएं|योजना|पेशकश/i },
  { label: "Documents", pattern: /documents?|publications?|reports?|दस्तावेज़|प्रकाशन/i },
  { label: "Media", pattern: /media|gallery|photos?|videos?|मीडिया/i },
  { label: "Connect", pattern: /connect|contact|grievance|rti|संपर्क|जुड़ें|जुड़े/i },
];

export const SOCIAL_DOMAINS: Record<string, RegExp> = {
  X: /(^|\.)(twitter|x)\.com$/i,
  Facebook: /(^|\.)facebook\.com$/i,
  Instagram: /(^|\.)instagram\.com$/i,
  YouTube: /(^|\.)(youtube\.com|youtu\.be)$/i,
  LinkedIn: /(^|\.)linkedin\.com$/i,
  WhatsApp: /(^|\.)(whatsapp\.com|wa\.me)$/i,
};

export const EDITABLE_DOC_EXT = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"];

/** §7.4 — CCPS content is served from the DBIM Toolkit. */
export const CCPS_HOST_PATTERN = /dbimtoolkit\.digifootprint\.gov\.in|digifootprint\.gov\.in|\bccps\b/i;

/** Organization types from §5.2 / §5.4. */
export const ORG_TYPES = {
  ministry: { label: "Central Ministry / Department", lockup: "Lockup 2", header: "Header 1" },
  "org-emblem": { label: "Government organization allowed to use the State Emblem", lockup: "Lockup 3A", header: "Header 2" },
  "org-no-emblem": { label: "Government organization not allowed to use the State Emblem (PSU, bank, etc.)", lockup: "Lockup 3B", header: "Header 3" },
} as const;
export type OrgType = keyof typeof ORG_TYPES;
