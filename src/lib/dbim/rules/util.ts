import { blend, matchPalette, parseColor, type RGBA } from "../../color";
import { PRIMARY_PALETTE } from "../spec";
import type { Evidence, ImageInfo, PageData, SiteData, Status } from "../types";

export const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };

export function opaque(color: string, over: RGBA = WHITE): RGBA | null {
  const c = parseColor(color);
  if (!c) return null;
  return c.a < 1 ? blend(c, over) : c;
}

export function extOf(url: string, mime?: string): string {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:image\/([a-z0-9+.-]+)/i);
    return m ? m[1].toLowerCase().replace("svg+xml", "svg").replace("jpeg", "jpg") : "";
  }
  if (mime && mime.startsWith("image/")) {
    const t = mime.slice(6).toLowerCase();
    return t === "svg+xml" ? "svg" : t === "jpeg" ? "jpg" : t === "x-icon" || t === "vnd.microsoft.icon" ? "ico" : t;
  }
  try {
    const p = new URL(url).pathname.toLowerCase();
    const m = p.match(/\.([a-z0-9]{2,5})$/);
    return m ? (m[1] === "jpeg" ? "jpg" : m[1]) : "";
  } catch {
    return "";
  }
}

export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "unknown";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function shortUrl(u: string, max = 90): string {
  try {
    const x = new URL(u);
    const s = x.host + x.pathname + x.search;
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  } catch {
    return u.slice(0, max);
  }
}

export function pageLabel(p: PageData): string {
  try {
    const u = new URL(p.finalUrl);
    return u.pathname === "/" || u.pathname === "" ? "Homepage" : u.pathname;
  } catch {
    return p.finalUrl;
  }
}

export function networkEntry(page: PageData, url: string) {
  return page.network.find((n) => n.url === url) ?? page.network.find((n) => n.url.split("?")[0] === url.split("?")[0]);
}

export function imageBytes(site: SiteData, url: string): { bytes: number | null; mime: string } {
  for (const p of site.pages) {
    const e = networkEntry(p, url);
    if (e) return { bytes: e.bytes, mime: e.mime };
  }
  return { bytes: null, mime: "" };
}

export function share(n: number, d: number) {
  return d === 0 ? 1 : n / d;
}

export function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

export function grade(ratio: number, passAt: number, warnAt: number): Status {
  return ratio >= passAt ? "pass" : ratio >= warnAt ? "warn" : "fail";
}

/** Uniquely list evidence items, capped. */
export function cap(items: Evidence[], n = 12): Evidence[] {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const e of items) {
    const k = JSON.stringify(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length >= n) break;
  }
  return out;
}

/** True when a raster image is drawn with a visibly different aspect ratio from its source. */
export function isDistorted(i: { src?: string; naturalWidth: number; naturalHeight: number; width: number; height: number; objectFit?: string }, tolerance = 0.04) {
  if (!i.naturalWidth || !i.naturalHeight || !i.width || !i.height) return false;
  if (i.objectFit && i.objectFit !== "fill") return false; // contain/cover/scale-down preserve proportions
  if (i.src && /\.svg(\?|#|$)|^data:image\/svg/i.test(i.src)) return false; // SVGs keep their aspect ratio inside any box
  return Math.abs(i.naturalWidth / i.naturalHeight / (i.width / i.height) - 1) > tolerance;
}

export function isIconImage(img: ImageInfo) {
  if (img.isBackground) return false;
  const { width: w, height: h } = img;
  return w > 0 && h > 0 && w <= 72 && h <= 72 && w / h > 0.75 && w / h < 1.33;
}

export function isLogoImage(img: ImageInfo) {
  if (img.isBackground || isIconImage(img)) return false;
  const hay = `${img.src} ${img.alt ?? ""}`.toLowerCase();
  if (img.inHeader && img.height <= 160) return true;
  if (/logo|emblem/.test(hay) && img.height <= 200) return true;
  return img.inFooter && img.inLink && img.height <= 140;
}

/** Weighted colour-group usage across all pages (desktop). */
/** The two lightest shades of every group are near-white tints that sit close to each other and to
 * ordinary off-whites (e.g. #FEF2F2 matches Burgundy's #FAEBF2), so they cannot tell groups apart.
 * Group detection uses only the key colour and the two mid shades. */
export const STRONG_SHADES = 3;

/** The primary-palette match for a colour, if it should count towards a colour group. */
export function groupMatch(color: string) {
  const c = opaque(color);
  const m = c && matchPalette(c);
  return m && m.kind === "primary" && m.group && (m.shade ?? 0) < STRONG_SHADES ? { ...m, group: m.group } : null;
}

export function colourGroupWeights(site: SiteData): Record<string, number> {
  const weights: Record<string, number> = Object.fromEntries(Object.keys(PRIMARY_PALETTE).map((g) => [g, 0]));
  for (const p of site.pages) {
    for (const u of p.desktop.colors) {
      const m = groupMatch(u.color);
      if (m) weights[m.group] += u.weight;
    }
    for (const s of p.svgs)
      for (const col of s.colors) {
        const m = groupMatch(col);
        if (m) weights[m.group] += 0.0005;
      }
  }
  return weights;
}

export function detectColourGroup(site: SiteData): string | null {
  const w = colourGroupWeights(site);
  const [best] = Object.entries(w).sort((a, b) => b[1] - a[1]);
  return best && best[1] > 0 ? best[0] : null;
}

export function isLatinHeavy(text: string) {
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const deva = (text.match(/[ऀ-ॿ]/g) || []).length;
  return latin >= deva;
}
