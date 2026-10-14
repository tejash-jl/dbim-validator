import { ALT_TEXT_BANNED, ALT_TEXT_MAX, IMAGE_FORMATS, IMAGE_LIMITS } from "../spec";
import type { Evidence, ImageInfo, Rule } from "../types";
import { cap, extOf, fmtBytes, imageBytes, isIconImage, isLogoImage, pageLabel } from "./util";

const CAT = "Imagery";

function kind(img: ImageInfo, viewportWidth: number): keyof typeof IMAGE_LIMITS {
  if (img.isBackground) return "background";
  if (img.width >= viewportWidth * 0.6 && img.height >= 200) return "banner";
  if (img.width <= 400 && img.height <= 400) return "thumbnail";
  return "highRes";
}
const KIND_LABEL = { background: "Background image", banner: "Banner/header image", thumbnail: "Thumbnail", highRes: "Photograph" };

export const imageryRules: Rule[] = [
  {
    id: "img.alt-present",
    title: "Images have alternative text",
    category: CAT,
    section: "6.1.2 i",
    severity: "critical",
    source: "automated",
    run: ({ site }) => {
      let total = 0;
      const bad: Evidence[] = [];
      for (const p of site.pages)
        for (const i of p.images) {
          if (i.isBackground || i.ariaHidden || i.role === "presentation" || i.role === "none") continue;
          total++;
          if (i.alt === null) bad.push({ page: pageLabel(p), url: i.src, value: "alt attribute missing" });
          else if (i.alt.trim() === "" && i.inLink && !i.linkText) bad.push({ page: pageLabel(p), url: i.src, value: "empty alt on the only content of a link" });
        }
      if (!total) return { status: "na", message: "No content images found.", evidence: [] };
      return {
        status: bad.length === 0 ? "pass" : bad.length / total <= 0.05 ? "warn" : "fail",
        message: `${total - bad.length} of ${total} images have appropriate alt attributes.`,
        evidence: cap(bad),
        fix: 'Give every informative image meaningful alt text; use alt="" only for purely decorative images that are not the sole content of a link.',
      };
    },
  },
  {
    id: "img.alt-quality",
    title: "Alt text is meaningful and at most 140 characters",
    category: CAT,
    section: "6.1.2 ii–iv",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const bad: Evidence[] = [];
      let total = 0;
      for (const p of site.pages)
        for (const i of p.images) {
          const alt = (i.alt || "").trim();
          if (!alt) continue;
          total++;
          if (ALT_TEXT_BANNED.test(alt)) bad.push({ page: pageLabel(p), url: i.src, value: `generic alt "${alt}"` });
          else if (/\.(jpe?g|png|gif|webp|svg)$/i.test(alt) || /^(img|dsc|image)[-_]?\d+/i.test(alt)) bad.push({ page: pageLabel(p), url: i.src, value: `file-name alt "${alt}"` });
          else if (alt.length > ALT_TEXT_MAX && !isIconImage(i)) bad.push({ page: pageLabel(p), url: i.src, value: `${alt.length} characters`, expected: `≤ ${ALT_TEXT_MAX} (unless informative image)` });
        }
      if (!total) return { status: "na", message: "No alt text to assess.", evidence: [] };
      return {
        status: bad.length === 0 ? "pass" : bad.length <= 3 ? "warn" : "fail",
        message: `${total - bad.length} of ${total} alt texts are descriptive and within length.`,
        evidence: cap(bad),
        fix: 'Describe the image content ("Minister inaugurating the Digital India Conclave, New Delhi") without “image of”/“picture of” or file names, within 140 characters.',
      };
    },
  },
  {
    id: "img.size-budget",
    title: "Images are within DBIM file-size limits",
    category: CAT,
    section: "6.1.1",
    checklist: "F.1 #30–33",
    severity: "major",
    source: "automated",
    run: ({ site }) => {
      const bad: Evidence[] = [];
      let measured = 0;
      const seen = new Set<string>();
      for (const p of site.pages)
        for (const i of p.images) {
          if (seen.has(i.src) || i.src.startsWith("data:") || isIconImage(i) || isLogoImage(i)) continue;
          seen.add(i.src);
          const { bytes } = imageBytes(site, i.src);
          if (bytes == null) continue;
          measured++;
          const k = kind(i, p.desktop.width);
          if (bytes > IMAGE_LIMITS[k]) bad.push({ page: pageLabel(p), url: i.src, value: `${KIND_LABEL[k]}: ${fmtBytes(bytes)}`, expected: `≤ ${fmtBytes(IMAGE_LIMITS[k])}` });
        }
      if (!measured) return { status: "na", message: "No image sizes could be measured.", evidence: [] };
      return {
        status: bad.length === 0 ? "pass" : bad.length <= 2 ? "warn" : "fail",
        message: bad.length ? `${bad.length} of ${measured} images exceed their DBIM size limit.` : `All ${measured} measured images are within limits (banners/backgrounds ≤ 500 KB, thumbnails ≤ 100 KB, photos ≤ 5 MB).`,
        evidence: cap(bad),
        fix: "Resize images to their display size and compress (WEBP recommended): banners/backgrounds ≤ 500 KB, thumbnails/cards ≤ 100 KB.",
      };
    },
  },
  {
    id: "img.format",
    title: "Images are JPEG/JPG, PNG or WEBP",
    category: CAT,
    section: "6.1.1",
    checklist: "F.1 #34",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const bad: Evidence[] = [];
      let total = 0;
      const seen = new Set<string>();
      for (const p of site.pages)
        for (const i of p.images) {
          if (seen.has(i.src) || isIconImage(i) || isLogoImage(i)) continue;
          seen.add(i.src);
          const ext = extOf(i.src, imageBytes(site, i.src).mime);
          if (!ext) continue;
          total++;
          if (!IMAGE_FORMATS.includes(ext) && ext !== "svg") bad.push({ page: pageLabel(p), url: i.src, value: ext.toUpperCase() });
        }
      if (!total) return { status: "na", message: "No image formats could be determined.", evidence: [] };
      return {
        status: bad.length ? "fail" : "pass",
        message: bad.length ? `${bad.length} of ${total} images use formats other than JPG/PNG/WEBP.` : `All ${total} images are JPG, PNG or WEBP.`,
        evidence: cap(bad),
        fix: "Convert GIF/BMP/TIFF/AVIF images to WEBP (photos, gradients), PNG (transparency) or JPG.",
      };
    },
  },
  {
    id: "img.resized",
    title: "Images are resized for display, not just scaled down",
    category: CAT,
    section: "6.1.1",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const bad: Evidence[] = [];
      const seen = new Set<string>();
      for (const p of site.pages)
        for (const i of p.images) {
          if (seen.has(i.src) || i.isBackground || !i.naturalWidth || !i.width) continue;
          seen.add(i.src);
          const { bytes } = imageBytes(site, i.src);
          // Allow 2× for high-DPI screens.
          if (i.naturalWidth > i.width * 2.5 && (bytes ?? 0) > 120 * 1024)
            bad.push({ page: pageLabel(p), url: i.src, value: `${i.naturalWidth}px source shown at ${Math.round(i.width)}px (${fmtBytes(bytes)})` });
        }
      return {
        status: bad.length === 0 ? "pass" : bad.length <= 3 ? "warn" : "fail",
        message: bad.length ? `${bad.length} image(s) are much larger than their display size.` : "Images are served close to their display size.",
        evidence: cap(bad),
        fix: "Generate resized variants (srcset) instead of downscaling large originals in the browser; link to the full-resolution file for download.",
      };
    },
  },
];
