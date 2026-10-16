import type { OrgType } from "./spec";

export type Status = "pass" | "fail" | "warn" | "manual" | "na" | "error";
export type Severity = "critical" | "major" | "minor";
export type Source = "automated" | "heuristic" | "ai" | "manual";

export type Evidence = {
  page?: string;
  selector?: string;
  value?: string;
  expected?: string;
  url?: string;
  note?: string;
};

export type CheckResult = {
  id: string;
  title: string;
  category: string;
  section: string; // DBIM section reference
  checklist?: string; // Annexure F reference, e.g. "F.1 #11"
  severity: Severity;
  source: Source;
  status: Status;
  message: string;
  evidence: Evidence[];
  fix?: string;
  confidence?: number; // AI checks only, 0..1
};

export type ScanOptions = {
  orgType: OrgType;
  maxPages: number; // 1 = homepage only
  lighthouse: boolean;
  checkLinks: boolean;
  checkPdfs: boolean;
  ai: boolean;
  /** Allow localhost / private-network URLs. Decided by the server (or CLI), never by the request. */
  allowPrivate?: boolean;
  /** Open visible browser windows during the scan (local use only). */
  headed?: boolean;
};

export const DEFAULT_OPTIONS: ScanOptions = {
  orgType: "ministry",
  maxPages: 6,
  lighthouse: true,
  checkLinks: true,
  checkPdfs: true,
  ai: true,
};

// ---------- Collected data ----------

export type TextSample = {
  sel: string;
  tag: string;
  chars: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number | null; // px, null when "normal"
  color: string;
  bg: string; // effective (opaque) background colour
  textAlign: string;
  textTransform: string;
  inHeader: boolean;
  inFooter: boolean;
};

export type ColorUse = { color: string; weight: number; prop: "bg" | "text" | "border" | "gradient" | "svg" };

export type ImageInfo = {
  sel: string;
  src: string;
  alt: string | null;
  role: string | null;
  ariaHidden: boolean;
  naturalWidth: number;
  naturalHeight: number;
  width: number;
  height: number;
  top: number;
  hasDims: boolean; // width/height attributes present
  objectFit: string;
  loading: string | null;
  inHeader: boolean;
  inFooter: boolean;
  inLink: boolean;
  linkText: string;
  isBackground: boolean;
};

export type SvgInfo = {
  sel: string;
  width: number;
  height: number;
  colors: string[];
  inHeader: boolean;
  inFooter: boolean;
  label: string;
  hasTitle: boolean;
};

export type LinkInfo = { href: string; text: string; inHeader: boolean; inFooter: boolean; inNav: boolean; title: string };

export type FormInfo = {
  sel: string;
  isFilter: boolean; // listing filter/sort forms rather than data-entry forms
  fields: { sel: string; type: string; labelled: boolean; clickableLabel: boolean; required: boolean; requiredMarked: boolean }[];
  introText: string;
};

export type ButtonInfo = { text: string; height: number; paddingX: number; fontSize: number; bg: string };

export type HeaderInfo = {
  found: boolean;
  sel: string | null;
  text: string;
  bg: string;
  hasSearch: boolean;
  searchWidth: number;
  hasSkipLink: boolean;
  skipLinkTarget: boolean;
  hasLanguageSwitch: boolean;
  hasAccessibilityControls: boolean;
  hasNav: boolean;
  navItems: string[];
  stickyAfterScroll: boolean | null;
  emblemCandidates: { src: string; alt: string; detectedBy?: string; width: number; height: number; naturalWidth: number; naturalHeight: number; objectFit: string }[];
  logoCandidates: { src: string; alt: string; width: number; height: number; naturalWidth: number; naturalHeight: number; objectFit: string }[];
  hasLogin: boolean;
};

export type FooterInfo = {
  found: boolean;
  sel: string | null;
  text: string;
  bg: string;
  links: { text: string; href: string }[];
};

export type NetworkEntry = {
  url: string;
  type: string; // playwright resourceType
  status: number;
  mime: string;
  bytes: number | null;
  cacheControl: string | null;
  encoding: string | null;
  fromThirdParty: boolean;
};

export type PerfInfo = {
  ttfb: number | null;
  domContentLoaded: number | null;
  load: number | null;
  lcp: number | null;
  cls: number | null;
  transferBytes: number;
};

export type ViewportData = {
  width: number;
  height: number;
  scrollWidth: number;
  texts: TextSample[];
  headings: { level: number; text: string; fontSize: number; fontWeight: number; fontFamily: string; inHeader: boolean; inFooter: boolean }[];
  colors: ColorUse[];
  screenshot?: string; // file path
};

export type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  nodes: { target: string; html: string; summary: string }[];
};

export type PageData = {
  url: string;
  finalUrl: string;
  status: number;
  title: string;
  lang: string | null;
  hreflangs: string[];
  metaViewport: string | null;
  metaDescription: string | null;
  bodyText: string;
  desktop: ViewportData;
  mobile: ViewportData | null;
  images: ImageInfo[];
  svgs: SvgInfo[];
  iconFonts: { sel: string; size: number; color: string }[];
  links: LinkInfo[];
  forms: FormInfo[];
  buttons: ButtonInfo[];
  tables: { headerAlign: string[]; numericCellAlign: string[] }[];
  header: HeaderInfo;
  footer: FooterInfo;
  cookieBanner: { found: boolean; atBottom: boolean; hasAccept: boolean; hasReject: boolean; hasCustomize: boolean; text: string };
  cookiesBeforeConsent: { name: string; domain: string }[];
  chatbot: { found: boolean; bottomRight: boolean };
  videos: { sel: string; hasCaptions: boolean; kind: "video" | "iframe"; src: string }[];
  hover: { sel: string; changed: boolean; props: string[] }[];
  search: { attempted: boolean; worked: boolean | null; note: string };
  network: NetworkEntry[];
  perf: PerfInfo;
  axe: AxeViolation[] | null;
  errors: string[];
  screenshotDesktop?: string;
  screenshotMobile?: string;
  screenshotFold?: string;
  screenshotHeader?: string;
  screenshotFooter?: string;
};

export type LighthouseSummary = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  lcp: number | null;
  cls: number | null;
  tbt: number | null;
  fcp: number | null;
  si: number | null;
  formFactor: string;
  /** Page Lighthouse ended up auditing (differs from the scanned page if the site redirected it). */
  finalUrl?: string;
};

export type LinkCheck = { url: string; status: number | null; ok: boolean; error?: string; foundOn: string };
export type PdfCheck = {
  url: string;
  bytes: number | null;
  tagged: boolean | null;
  hasStructTree: boolean | null;
  hasLang: boolean | null;
  hasTitle: boolean | null;
  error?: string;
};

export type AiAssessment = {
  key: string;
  status: "pass" | "fail" | "warn" | "unclear";
  confidence: number;
  explanation: string;
};

export type SiteData = {
  startUrl: string;
  options: ScanOptions;
  pages: PageData[];
  lighthouse: LighthouseSummary | null;
  links: LinkCheck[] | null;
  pdfs: PdfCheck[] | null;
  ai: AiAssessment[] | null;
  aiError?: string;
  lighthouseError?: string;
};

export type RuleContext = {
  site: SiteData;
  home: PageData;
  orgType: OrgType;
  /** Primary colour group detected for the site (computed once, shared by colour rules). */
  colourGroup: string | null;
};

export type Rule = {
  id: string;
  title: string;
  category: string;
  section: string;
  checklist?: string;
  severity: Severity;
  source: Source;
  appliesTo?: OrgType[];
  run: (ctx: RuleContext) => Omit<CheckResult, "id" | "title" | "category" | "section" | "checklist" | "severity" | "source"> &
    Partial<Pick<CheckResult, "source">>;
};

/** A scanned page as stored in the report. Screenshot fields are file names inside the scan folder. */
export type ReportPage = {
  url: string;
  status: number;
  title: string;
  screenshotDesktop?: string; // full page (up to 9000px)
  screenshotMobile?: string; // full page at 390px
  screenshotFold?: string; // desktop, first screen only
  screenshotHeader?: string;
  screenshotFooter?: string;
};

export type ScanReport = {
  url: string;
  orgType: OrgType;
  options: ScanOptions;
  scannedAt: string;
  durationMs: number;
  /** Browser that rendered the scan, e.g. "Google Chrome 141.0.7390.55". */
  browser?: string;
  pages: ReportPage[];
  colourGroup: string | null;
  score: number;
  categoryScores: { category: string; score: number; pass: number; fail: number; warn: number; manual: number }[];
  counts: Record<Status, number>;
  results: CheckResult[];
  lighthouse: LighthouseSummary | null;
  notes: string[];
};
