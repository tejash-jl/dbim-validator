import { ICON_FORMATS, ICON_SIZES } from "../spec";
import type { Evidence, Rule } from "../types";
import { cap, extOf, grade, imageBytes, isDistorted, isIconImage, pageLabel, shortUrl } from "./util";

const CAT = "Iconography";
// Figure 9: listed sizes include 2px padding, so the drawn icon may also measure size − 4.
const OK_SIZES = [...ICON_SIZES, ...ICON_SIZES.map((s) => s - 4)];
const sizeOk = (w: number, h: number) => OK_SIZES.some((s) => Math.abs(w - s) <= 1 && Math.abs(h - s) <= 1);

export const iconRules: Rule[] = [
  {
    id: "icons.size",
    title: "Icon sizes are 24, 32, 48 or 64 px",
    category: CAT,
    section: "3.4",
    checklist: "F.1 #8",
    severity: "minor",
    source: "heuristic",
    run: ({ site }) => {
      let total = 0, ok = 0;
      const bad: Evidence[] = [];
      for (const p of site.pages) {
        for (const s of p.svgs) {
          if (s.width < 10) continue;
          total++;
          if (sizeOk(s.width, s.height)) ok++;
          else bad.push({ page: pageLabel(p), selector: s.sel, value: `${Math.round(s.width)}×${Math.round(s.height)} svg` });
        }
        for (const img of p.images.filter(isIconImage)) {
          total++;
          if (sizeOk(img.width, img.height)) ok++;
          else bad.push({ page: pageLabel(p), selector: img.sel, value: `${Math.round(img.width)}×${Math.round(img.height)} ${shortUrl(img.src, 50)}` });
        }
        for (const f of p.iconFonts) {
          total++;
          if (OK_SIZES.some((s) => Math.abs(f.size - s) <= 1)) ok++;
          else bad.push({ page: pageLabel(p), selector: f.sel, value: `icon font at ${f.size}px` });
        }
      }
      if (!total) return { status: "na", message: "No icons were detected.", evidence: [] };
      const r = ok / total;
      return {
        status: grade(r, 0.8, 0.5),
        message: `${ok} of ${total} icons (${Math.round(r * 100)}%) render at a DBIM icon size.`,
        evidence: cap(bad),
        fix: "Render icons at 24×24, 32×32, 48×48 or 64×64 px (including 2px padding). Download sized icons from the DBIM Toolkit Visual Components Library.",
      };
    },
  },
  {
    id: "icons.format",
    title: "Icons are PNG, SVG or WEBP",
    category: CAT,
    section: "3.7 ii",
    checklist: "F.1 #7",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const icons = site.pages.flatMap((p) => p.images.filter(isIconImage).map((i) => ({ ...i, page: pageLabel(p) })));
      if (!icons.length) return { status: "na", message: "No image-based icons were found (inline SVG icons comply by format).", evidence: [] };
      const bad = icons.filter((i) => {
        const ext = extOf(i.src, imageBytes(site, i.src).mime);
        return ext && !ICON_FORMATS.includes(ext);
      });
      return {
        status: bad.length ? "fail" : "pass",
        message: bad.length ? `${bad.length} of ${icons.length} image icons use a format other than PNG/SVG/WEBP.` : `All ${icons.length} image icons are PNG, SVG or WEBP.`,
        evidence: cap(bad.map((i) => ({ page: i.page, url: i.src, value: extOf(i.src, imageBytes(site, i.src).mime).toUpperCase() }))),
        fix: "Convert GIF/JPG/ICO icons to SVG (preferred), PNG or WEBP.",
      };
    },
  },
  {
    id: "icons.proportion",
    title: "Icons keep their proportions (not stretched)",
    category: CAT,
    section: "3.7 iv",
    checklist: "F.1 #9",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const icons = site.pages.flatMap((p) => p.images.filter((i) => isIconImage(i) && i.naturalWidth > 0).map((i) => ({ ...i, page: pageLabel(p) })));
      if (!icons.length) return { status: "na", message: "No raster icons with known dimensions were found.", evidence: [] };
      const bad = icons.filter((i) => isDistorted(i, 0.05));
      return {
        status: bad.length ? "fail" : "pass",
        message: bad.length ? `${bad.length} icon(s) are displayed with a different aspect ratio from the source image.` : "All raster icons keep their original proportions.",
        evidence: cap(bad.map((i) => ({ page: i.page, url: i.src, value: `source ${i.naturalWidth}×${i.naturalHeight}, shown ${Math.round(i.width)}×${Math.round(i.height)}` }))),
        fix: "Set only one dimension (or matching width/height) so icons scale proportionally.",
      };
    },
  },
  {
    id: "icons.tooltip",
    title: "Icon-only controls have a tooltip or accessible label",
    category: CAT,
    section: "3.8 i",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const bad: Evidence[] = [];
      let total = 0;
      for (const p of site.pages) {
        for (const s of p.svgs) {
          total++;
          if (!s.label && !s.hasTitle) bad.push({ page: pageLabel(p), selector: s.sel, value: "SVG icon with no label/title" });
        }
        for (const img of p.images.filter((i) => isIconImage(i) && i.inLink && !i.linkText)) {
          total++;
          if (!img.alt) bad.push({ page: pageLabel(p), selector: img.sel, value: `linked icon with empty alt: ${shortUrl(img.src, 50)}` });
        }
      }
      if (!total) return { status: "na", message: "No icons found.", evidence: [] };
      return {
        status: bad.length === 0 ? "pass" : bad.length / total < 0.2 ? "warn" : "fail",
        message: `${total - bad.length} of ${total} icons have a label, title or alt text.`,
        evidence: cap(bad),
        fix: 'Add a title (tooltip) and aria-label to icon-only links/buttons, e.g. <a title="Search" aria-label="Search">.',
      };
    },
  },
];
