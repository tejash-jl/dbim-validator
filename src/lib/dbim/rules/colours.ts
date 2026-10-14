import { contrastRatio, deltaE, keyColourOf, matchPalette, parseColor } from "../../color";
import { PRIMARY_PALETTE } from "../spec";
import type { Evidence, Rule } from "../types";
import { cap, colourGroupWeights, groupMatch, grade, opaque, pageLabel, pct, share } from "./util";

const CAT = "Colours";

export const colourRules: Rule[] = [
  {
    id: "colours.primary-group",
    title: "One colour group from the primary palette is used",
    category: CAT,
    section: "2.1",
    checklist: "F.1 #1",
    severity: "major",
    source: "automated",
    run: ({ site }) => {
      const w = colourGroupWeights(site);
      const sorted = Object.entries(w).sort((a, b) => b[1] - a[1]);
      const [top, second] = sorted;
      if (!top || top[1] === 0)
        return {
          status: "fail",
          message: "No key or mid shade from any DBIM primary colour group was found on the scanned pages.",
          evidence: [{ value: "The two lightest tints of each group are not counted: they are too close to ordinary off-whites to identify a group." }],
          fix: "Choose one of the six colour groups (Burgundy, Purple, Blue, Green, Chrome Yellow, Cinnamon Red) and apply its key colour and variants.",
        };
      // Which observed colours matched each group, and where, so the result can be acted on.
      const found: Record<string, Map<string, { w: number; props: Set<string>; pages: Set<string> }>> = {};
      for (const p of site.pages)
        for (const u of p.desktop.colors) {
          const m = groupMatch(u.color);
          if (!m) continue;
          const o = (found[m.group] ??= new Map()).get(m.hex) ?? { w: 0, props: new Set<string>(), pages: new Set<string>() };
          o.w += u.weight;
          o.props.add(u.prop);
          o.pages.add(pageLabel(p));
          found[m.group].set(m.hex, o);
        }
      const describe = (g: string) =>
        [...(found[g] ?? new Map()).entries()]
          .sort((a, b) => b[1].w - a[1].w)
          .slice(0, 4)
          .map(([hex, o]) => `${hex} (${[...o.props].join("/")}; ${[...o.pages].slice(0, 2).join(", ")})`)
          .join(" · ");
      const ev: Evidence[] = sorted
        .filter(([, v]) => v > 0)
        .map(([g, v]) => ({ value: `${g}: ${pct(v / top[1])} of the leading group's usage${describe(g) ? ` — found ${describe(g)}` : " (SVG only)"}`, expected: PRIMARY_PALETTE[g].join(" ") }));
      if (second && second[1] > top[1] * 0.25)
        return {
          status: "fail",
          message: `More than one primary colour group is in use (${top[0]} and ${second[0]}). DBIM allows exactly one group per organization.`,
          evidence: ev,
          fix: `Keep ${top[0]} and replace ${second[0]} colours with ${top[0]} shades or functional palette colours.`,
        };
      if (second && second[1] > top[1] * 0.08)
        return {
          status: "warn",
          message: `${top[0]} is the main colour group, but some ${second[0]} colours also appear.`,
          evidence: ev,
          fix: `Replace the ${second[0]} colours with ${top[0]} shades or functional palette colours.`,
        };
      return { status: "pass", message: `The site uses the ${top[0]} colour group.`, evidence: ev.slice(0, 1) };
    },
  },
  {
    id: "colours.palette-only",
    title: "Other colours come from the DBIM palettes",
    category: CAT,
    section: "2.2",
    checklist: "F.1 #2",
    severity: "major",
    source: "automated",
    run: ({ site }) => {
      const off: Record<string, { w: number; props: Set<string>; pages: Set<string> }> = {};
      let total = 0, offTotal = 0;
      for (const p of site.pages)
        for (const u of p.desktop.colors) {
          const c = opaque(u.color);
          if (!c) continue;
          total += u.weight;
          const m = matchPalette(c);
          if (m.kind !== "none") continue;
          offTotal += u.weight;
          const o = (off[m.hex] ??= { w: 0, props: new Set(), pages: new Set() });
          o.w += u.weight;
          o.props.add(u.prop);
          o.pages.add(pageLabel(p));
        }
      const ratio = share(offTotal, total);
      const list = Object.entries(off)
        .sort((a, b) => b[1].w - a[1].w)
        .slice(0, 10)
        .map(([hex, o]) => {
          const nearest = matchPalette(parseColor(hex)!, Infinity);
          return {
            value: `${hex} (${pct(o.w / Math.max(total, 1e-9))} of colour usage; ${[...o.props].join(", ")})`,
            expected: nearest.paletteHex ? `nearest DBIM colour ${nearest.paletteHex}` : undefined,
            page: [...o.pages].slice(0, 3).join(", "),
          };
        });
      const status = ratio <= 0.05 ? "pass" : ratio <= 0.15 ? "warn" : "fail";
      return {
        status,
        message:
          status === "pass"
            ? `${pct(1 - ratio)} of colour usage matches the primary or functional palette.`
            : `${pct(ratio)} of colour usage (backgrounds, text, borders) is outside the DBIM palettes.`,
        evidence: list,
        fix: "Map off-palette colours to the nearest key-colour variant or functional colour (e.g. text #150202, links #0D6EFD, greys #C6C6C6 / #8E8E8E / #606060).",
      };
    },
  },
  {
    id: "colours.footer",
    title: "Footer uses the key colour (darkest shade) of the selected group",
    category: CAT,
    section: "5.6",
    checklist: "F.1 #4",
    severity: "major",
    source: "automated",
    run: ({ site, colourGroup }) => {
      const footers = site.pages.filter((p) => p.footer.found && p.footer.bg);
      if (!footers.length) return { status: "fail", message: "No footer was detected, so its colour could not be checked.", evidence: [] };
      if (!colourGroup) return { status: "warn", message: "No primary colour group was detected to compare the footer against.", evidence: footers.map((p) => ({ page: pageLabel(p), value: p.footer.bg })) };
      const key = keyColourOf(colourGroup);
      const bad: Evidence[] = [];
      for (const p of footers) {
        const c = opaque(p.footer.bg)!;
        const d = deltaE(c, key);
        if (d > 8) {
          const m = matchPalette(c);
          bad.push({ page: pageLabel(p), selector: "footer", value: `${m.hex}${m.kind === "primary" ? ` (${m.group} shade ${m.shade! + 1})` : m.kind === "functional" ? ` (${m.name})` : ""}`, expected: PRIMARY_PALETTE[colourGroup][0] });
        }
      }
      if (!bad.length) return { status: "pass", message: `Footer background matches the ${colourGroup} key colour ${PRIMARY_PALETTE[colourGroup][0]}.`, evidence: [] };
      return {
        status: "fail",
        message: `Footer background is not the ${colourGroup} key colour ${PRIMARY_PALETTE[colourGroup][0]}.`,
        evidence: cap(bad),
        fix: `Set the footer background to ${PRIMARY_PALETTE[colourGroup][0]} with Inclusive White (#FFFFFF) text.`,
      };
    },
  },
  {
    id: "colours.icons",
    title: "Icons use the key colour or inclusive white",
    category: CAT,
    section: "3.7 iii",
    checklist: "F.1 #3",
    severity: "minor",
    source: "automated",
    run: ({ site, colourGroup }) => {
      if (!colourGroup) return { status: "na", message: "No colour group detected; icon colours not assessed.", evidence: [] };
      const key = keyColourOf(colourGroup);
      const white = parseColor("#FFFFFF")!;
      let total = 0, ok = 0;
      const bad: Evidence[] = [];
      const check = (page: string, sel: string, colors: string[]) => {
        const cs = colors.map((c) => opaque(c)).filter(Boolean) as ReturnType<typeof opaque>[];
        if (!cs.length) return;
        total++;
        const good = cs.every((c) => deltaE(c!, key) <= 10 || deltaE(c!, white) <= 6);
        if (good) ok++;
        else bad.push({ page, selector: sel, value: cs.map((c) => matchPalette(c!).hex).join(", "), expected: `${PRIMARY_PALETTE[colourGroup][0]} or #FFFFFF` });
      };
      for (const p of site.pages) {
        for (const s of p.svgs) check(pageLabel(p), s.sel, s.colors);
        for (const f of p.iconFonts) check(pageLabel(p), f.sel, [f.color]);
      }
      if (!total) return { status: "na", message: "No inline SVG or icon-font icons were found (image icons are checked for format and size).", evidence: [] };
      const r = ok / total;
      return {
        status: grade(r, 0.9, 0.6),
        message: `${ok} of ${total} icons (${pct(r)}) use the ${colourGroup} key colour or white.`,
        evidence: cap(bad, 10),
        fix: `Recolour icons to ${PRIMARY_PALETTE[colourGroup][0]} on light backgrounds and #FFFFFF on dark backgrounds.`,
      };
    },
  },
  {
    id: "colours.text",
    title: "Text colour follows DBIM and has sufficient contrast",
    category: "Typography",
    section: "4.4",
    checklist: "F.1 #15",
    severity: "major",
    source: "automated",
    run: ({ site }) => {
      const lowContrast: Evidence[] = [];
      let bodyChars = 0, brownChars = 0, totalChars = 0, failChars = 0;
      const brown = parseColor("#150202")!;
      for (const p of site.pages)
        for (const t of p.desktop.texts) {
          const bg = opaque(t.bg)!;
          const fg = opaque(t.color, bg);
          if (!fg || !bg) continue;
          totalChars += t.chars;
          const ratio = contrastRatio(fg, bg);
          const large = t.fontSize >= 24 || (t.fontSize >= 18.66 && t.fontWeight >= 700);
          if (ratio < (large ? 3 : 4.5)) {
            failChars += t.chars;
            lowContrast.push({ page: pageLabel(p), selector: t.sel, value: `${matchPalette(fg).hex} on ${matchPalette(bg).hex} = ${ratio.toFixed(2)}:1 "${t.text.slice(0, 40)}"`, expected: large ? "≥ 3:1" : "≥ 4.5:1" });
          }
          const lightBg = bg.r + bg.g + bg.b > 600;
          if (lightBg && !t.inHeader && !t.inFooter && t.tag !== "a" && t.chars > 30) {
            bodyChars += t.chars;
            if (deltaE(fg, brown) <= 8) brownChars += t.chars;
          }
        }
      const contrastOk = share(totalChars - failChars, totalChars);
      const brownShare = share(brownChars, bodyChars);
      const status = contrastOk < 0.97 ? "fail" : brownShare < 0.6 ? "warn" : "pass";
      const parts = [`${pct(contrastOk)} of text meets WCAG 2.1 contrast (1.4.3).`];
      parts.push(`${pct(brownShare)} of body text on light backgrounds uses Deep Earthy Brown #150202.`);
      return {
        status,
        message: parts.join(" "),
        evidence: cap(lowContrast.sort((a, b) => (a.value! < b.value! ? -1 : 1)), 12),
        fix: "Use Deep Earthy Brown (#150202) for text on light backgrounds and Inclusive White (#FFFFFF) on dark backgrounds; fix pairs below 4.5:1.",
      };
    },
  },
];
