import { ALLOWED_WEIGHTS, LINE_HEIGHT_RANGE, TYPE_SCALE } from "../spec";
import type { Evidence, PageData, Rule, ViewportData } from "../types";
import { cap, grade, pageLabel, pct, share } from "./util";

const CAT = "Typography";

function firstFamily(stack: string) {
  return (stack.split(",")[0] || "").replace(/["']/g, "").trim();
}

function scaleCheck(site: { pages: PageData[] }, view: "desktop" | "mobile") {
  const scale = TYPE_SCALE[view];
  const allowedBody = [scale.p1, scale.p2, scale.small, scale.h1, scale.h2, scale.h3];
  const issues: Evidence[] = [];
  let headingTotal = 0, headingOk = 0, textChars = 0, textOk = 0;
  for (const p of site.pages) {
    const v: ViewportData | null = view === "desktop" ? p.desktop : p.mobile;
    if (!v) continue;
    for (const h of v.headings) {
      if (h.level > 3 || h.inHeader || h.inFooter) continue; // lockup/footer text is governed by §5
      const expected = h.level === 1 ? scale.h1 : h.level === 2 ? scale.h2 : scale.h3;
      headingTotal++;
      if (Math.abs(h.fontSize - expected) <= 0.5) headingOk++;
      else issues.push({ page: pageLabel(p), selector: `h${h.level}`, value: `${h.fontSize}px "${h.text.slice(0, 50)}"`, expected: `${expected}px` });
    }
    for (const t of v.texts) {
      if (/^h[1-6]$/.test(t.tag)) continue;
      textChars += t.chars;
      if (allowedBody.some((s) => Math.abs(t.fontSize - s) <= 0.5)) textOk += t.chars;
    }
  }
  const hRatio = share(headingOk, headingTotal);
  const tRatio = share(textOk, textChars);
  const usedSizes = new Map<number, number>();
  for (const p of site.pages) {
    const v = view === "desktop" ? p.desktop : p.mobile;
    v?.texts.forEach((t) => usedSizes.set(t.fontSize, (usedSizes.get(t.fontSize) || 0) + t.chars));
  }
  const offSizes = [...usedSizes.entries()]
    .filter(([s]) => !allowedBody.some((a) => Math.abs(a - s) <= 0.5))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([s, c]) => ({ value: `${s}px used for ${c} characters`, expected: allowedBody.filter((v, i, a) => a.indexOf(v) === i).join(" / ") + "px" }));
  const status = hRatio >= 0.9 && tRatio >= 0.8 ? "pass" : hRatio >= 0.5 && tRatio >= 0.5 ? "warn" : "fail";
  return {
    status,
    message: `${headingOk}/${headingTotal} H1–H3 headings and ${pct(tRatio)} of other text use the ${view} type scale (H1 ${scale.h1}, H2 ${scale.h2}, H3 ${scale.h3}, body ${scale.p1}/${scale.p2}, small ${scale.small}px).`,
    evidence: cap([...issues, ...offSizes], 14),
  } as const;
}

export const typographyRules: Rule[] = [
  {
    id: "type.noto-sans",
    title: "Typeface is Noto Sans",
    category: CAT,
    section: "4.1, 4.2",
    checklist: "F.1 #11",
    severity: "major",
    source: "automated",
    run: ({ site }) => {
      const fam = new Map<string, number>();
      let total = 0, noto = 0;
      for (const p of site.pages)
        for (const t of p.desktop.texts) {
          const f = firstFamily(t.fontFamily);
          fam.set(f, (fam.get(f) || 0) + t.chars);
          total += t.chars;
          if (/noto\s*sans/i.test(f)) noto += t.chars;
        }
      const r = share(noto, total);
      const ev = [...fam.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, c]) => ({ value: `${f || "(default)"}: ${pct(c / Math.max(total, 1))} of text` }));
      return {
        status: grade(r, 0.95, 0.7),
        message: `${pct(r)} of text is set in Noto Sans.`,
        evidence: ev,
        fix: 'Load Noto Sans (and Noto Sans Devanagari etc. for Indian scripts) and set `font-family: "Noto Sans", sans-serif` on body and headings.',
      };
    },
  },
  {
    id: "type.scale-desktop",
    title: "Desktop type scale matches DBIM",
    category: CAT,
    section: "4.3.1",
    checklist: "F.1 #14",
    severity: "minor",
    source: "automated",
    run: ({ site }) => ({ ...scaleCheck(site, "desktop"), fix: "Use 36/24/20px for H1/H2/H3, 16 or 14px for paragraphs and 12px for small text on desktop." }),
  },
  {
    id: "type.scale-mobile",
    title: "Mobile type scale matches DBIM",
    category: CAT,
    section: "4.3.2",
    checklist: "F.1 #14",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      if (!site.pages.some((p) => p.mobile)) return { status: "error", message: "Mobile rendering failed; mobile type scale not checked.", evidence: [] };
      return { ...scaleCheck(site, "mobile"), fix: "Use 24/20/16px for H1/H2/H3, 14 or 12px for paragraphs and 10px for small text on mobile." };
    },
  },
  {
    id: "type.weights",
    title: "Font weights are Regular, Medium, Semi Bold or Bold",
    category: CAT,
    section: "4.1.1 iii",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const off = new Map<number, number>();
      let total = 0, ok = 0;
      for (const p of site.pages)
        for (const t of p.desktop.texts) {
          total += t.chars;
          if (ALLOWED_WEIGHTS.includes(t.fontWeight)) ok += t.chars;
          else off.set(t.fontWeight, (off.get(t.fontWeight) || 0) + t.chars);
        }
      const r = share(ok, total);
      return {
        status: grade(r, 0.95, 0.8),
        message: `${pct(r)} of text uses weights 400/500/600/700.`,
        evidence: [...off.entries()].map(([w, c]) => ({ value: `weight ${w}: ${c} characters`, expected: "400, 500, 600 or 700" })),
        fix: "Avoid Light (300) and Extra Bold/Black (800/900) weights.",
      };
    },
  },
  {
    id: "type.alignment",
    title: "Body text is left-aligned; tables align text left, numbers right, headers centre",
    category: CAT,
    section: "4.1.1 i",
    checklist: "F.1 #12",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const bad: Evidence[] = [];
      let paras = 0, badParas = 0;
      for (const p of site.pages)
        for (const t of p.desktop.texts) {
          if (t.chars < 150 || t.inHeader || t.inFooter || /^h\d$/.test(t.tag)) continue;
          paras++;
          if (["justify", "center", "right"].includes(t.textAlign)) {
            badParas++;
            bad.push({ page: pageLabel(p), selector: t.sel, value: `text-align: ${t.textAlign} — "${t.text.slice(0, 50)}…"`, expected: "left" });
          }
        }
      let tableIssues = 0;
      for (const p of site.pages)
        for (const tb of p.tables) {
          const nonCenter = tb.headerAlign.filter((a) => a !== "center").length;
          const numNotRight = tb.numericCellAlign.filter((a) => !["right", "end"].includes(a)).length;
          if (nonCenter || numNotRight) {
            tableIssues++;
            bad.push({ page: pageLabel(p), selector: "table", value: `${nonCenter} column header(s) not centred, ${numNotRight} numeric cell(s) not right-aligned` });
          }
        }
      const status = badParas === 0 && tableIssues === 0 ? "pass" : share(paras - badParas, paras) >= 0.9 ? "warn" : "fail";
      return {
        status,
        message: `${paras - badParas}/${paras} paragraphs are left-aligned; ${tableIssues} table(s) deviate from the alignment rule.`,
        evidence: cap(bad),
        fix: "Use text-align: left for body text (no justify/centre); in tables centre the column names, left-align text and right-align numbers.",
      };
    },
  },
  {
    id: "type.all-caps",
    title: "No all-capital text for long sentences",
    category: CAT,
    section: "4.1.1 ii",
    checklist: "F.1 #13",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const bad: Evidence[] = [];
      for (const p of site.pages)
        for (const t of p.desktop.texts) {
          const words = t.text.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
          if (words.length < 7) continue;
          const letters = t.text.replace(/[^A-Za-z]/g, "");
          const caps = t.textTransform === "uppercase" || (letters.length >= 25 && letters === letters.toUpperCase());
          if (caps) bad.push({ page: pageLabel(p), selector: t.sel, value: `"${t.text.slice(0, 70)}"` });
        }
      return {
        status: bad.length === 0 ? "pass" : bad.length <= 2 ? "warn" : "fail",
        message: bad.length ? `${bad.length} sentence(s) of 7+ words are set in all capitals.` : "No long all-capital text found.",
        evidence: cap(bad),
        fix: "Use sentence case for sentences and paragraphs; reserve capitals for short labels or acronyms.",
      };
    },
  },
  {
    id: "type.line-height",
    title: "Line height is 1.2–1.5 times the type size",
    category: CAT,
    section: "4.5 iii",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      let total = 0, ok = 0;
      const bad: Evidence[] = [];
      for (const p of site.pages)
        for (const t of p.desktop.texts) {
          if (t.chars < 80) continue;
          total += t.chars;
          const ratio = t.lineHeight === null ? 1.36 : t.lineHeight / t.fontSize; // "normal" for Noto Sans ≈ 1.36
          if (ratio >= LINE_HEIGHT_RANGE[0] - 0.02 && ratio <= LINE_HEIGHT_RANGE[1] + 0.02) ok += t.chars;
          else bad.push({ page: pageLabel(p), selector: t.sel, value: `${ratio.toFixed(2)} (${t.lineHeight}px / ${t.fontSize}px)`, expected: "1.2–1.5" });
        }
      const r = share(ok, total);
      return { status: grade(r, 0.9, 0.6), message: `${pct(r)} of paragraph text has a line height between 1.2 and 1.5.`, evidence: cap(bad), fix: "Set line-height between 1.2 and 1.5 (e.g. 1.5 for body text)." };
    },
  },
  {
    id: "type.hover",
    title: "Mouse hover gives a noticeable change on clickable items",
    category: CAT,
    section: "4.5 iv",
    checklist: "F.1 #18",
    severity: "minor",
    source: "automated",
    run: ({ site }) => {
      const all = site.pages.flatMap((p) => p.hover.map((h) => ({ ...h, page: pageLabel(p) })));
      if (!all.length) return { status: "error", message: "No clickable elements could be hover-tested.", evidence: [] };
      const ok = all.filter((h) => h.changed).length;
      const r = ok / all.length;
      return {
        status: grade(r, 0.8, 0.5),
        message: `${ok} of ${all.length} sampled links/buttons change appearance on hover.`,
        evidence: cap(all.filter((h) => !h.changed).map((h) => ({ page: h.page, selector: h.sel, value: "no visual change on hover" }))),
        fix: "Add a :hover style (colour, underline, background or shadow change) to every link and button.",
      };
    },
  },
  {
    id: "type.buttons",
    title: "CTA buttons have consistent size and padding",
    category: CAT,
    section: "4.5 i",
    checklist: "F.1 #16",
    severity: "minor",
    source: "heuristic",
    run: ({ site }) => {
      const btns = site.pages.flatMap((p) => p.buttons.filter((b) => b.height >= 24 && b.height <= 80));
      if (btns.length < 2) return { status: "na", message: "Fewer than two filled CTA buttons were found.", evidence: [] };
      const groups: number[] = [];
      for (const b of btns) if (!groups.some((g) => Math.abs(g - b.height) <= 3)) groups.push(b.height);
      const pads: number[] = [];
      for (const b of btns) if (!pads.some((g) => Math.abs(g - b.paddingX) <= 4)) pads.push(b.paddingX);
      const status = groups.length <= 3 && pads.length <= 4 ? "pass" : groups.length <= 5 ? "warn" : "fail";
      return {
        status,
        message: `${btns.length} filled buttons use ${groups.length} distinct heights and ${pads.length} distinct horizontal paddings.`,
        evidence: groups.map((g) => ({ value: `height ≈ ${g}px: ${btns.filter((b) => Math.abs(b.height - g) <= 3).slice(0, 4).map((b) => `"${b.text}"`).join(", ")}` })),
        fix: "Define a small set of button sizes (e.g. small/medium/large) with uniform padding and reuse them everywhere.",
      };
    },
  },
];
