import { FUNCTIONAL_PALETTE, PRIMARY_PALETTE } from "./dbim/spec";

export type RGBA = { r: number; g: number; b: number; a: number };

export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  return null;
}

export function toHex({ r, g, b }: RGBA): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Composite a translucent colour over an opaque background. */
export function blend(fg: RGBA, bg: RGBA): RGBA {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

function srgbToLinear(c: number) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function toLab({ r, g, b }: RGBA): [number, number, number] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference. ~2.3 is a just-noticeable difference. */
export function deltaE(a: RGBA, b: RGBA): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export function relativeLuminance({ r, g, b }: RGBA): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function contrastRatio(a: RGBA, b: RGBA): number {
  const l1 = relativeLuminance(a), l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export type PaletteMatch = {
  hex: string;
  kind: "primary" | "functional" | "none";
  group?: string; // primary group name
  shade?: number; // 0 = key colour (darkest)
  name?: string; // functional colour name
  paletteHex?: string;
  distance: number;
};

const PRIMARY_ENTRIES = Object.entries(PRIMARY_PALETTE).flatMap(([group, shades]) =>
  shades.map((hex, shade) => ({ group, shade, hex, rgba: parseColor(hex)! })),
);
const FUNCTIONAL_ENTRIES = Object.entries(FUNCTIONAL_PALETTE).map(([name, hex]) => ({ name, hex, rgba: parseColor(hex)! }));

/** Maximum CIE76 distance at which a colour counts as "the same" palette colour. */
export const MATCH_TOLERANCE = 6;

export function matchPalette(color: RGBA, tolerance = MATCH_TOLERANCE): PaletteMatch {
  const hex = toHex(color);
  let best: PaletteMatch = { hex, kind: "none", distance: Infinity };
  // Functional colours first so that pure white/black are not attributed to a group.
  for (const f of FUNCTIONAL_ENTRIES) {
    const d = deltaE(color, f.rgba);
    if (d < best.distance) best = { hex, kind: "functional", name: f.name, paletteHex: f.hex, distance: d };
  }
  for (const p of PRIMARY_ENTRIES) {
    const d = deltaE(color, p.rgba);
    if (d < best.distance - 0.01)
      best = { hex, kind: "primary", group: p.group, shade: p.shade, paletteHex: p.hex, distance: d };
  }
  if (best.distance > tolerance) return { hex, kind: "none", distance: best.distance, paletteHex: best.paletteHex };
  return best;
}

export function keyColourOf(group: string): RGBA {
  return parseColor(PRIMARY_PALETTE[group][0])!;
}
