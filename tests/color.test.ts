import { describe, expect, it } from "vitest";
import { contrastRatio, deltaE, matchPalette, parseColor } from "../src/lib/color";

describe("parseColor", () => {
  it("parses hex, short hex and rgba", () => {
    expect(parseColor("#162F6A")).toEqual({ r: 22, g: 47, b: 106, a: 1 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("rgba(0, 0, 0, 0.5)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseColor("rgb(1 2 3 / 50%)")).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseColor("transparent")?.a).toBe(0);
  });
});

describe("matchPalette", () => {
  it("maps exact and near palette colours", () => {
    const key = matchPalette(parseColor("#162F6A")!);
    expect(key).toMatchObject({ kind: "primary", group: "Blue", shade: 0 });
    expect(matchPalette(parseColor("#172F6B")!)).toMatchObject({ kind: "primary", group: "Blue" });
    expect(matchPalette(parseColor("#FFFFFF")!)).toMatchObject({ kind: "functional", name: "Inclusive White" });
    expect(matchPalette(parseColor("#150202")!)).toMatchObject({ kind: "functional", name: "Deep Earthy Brown" });
  });
  it("rejects off-palette colours", () => {
    expect(matchPalette(parseColor("#FF00FF")!).kind).toBe("none");
    expect(matchPalette(parseColor("#333333")!).kind).toBe("none");
  });
});

describe("contrast and distance", () => {
  it("computes WCAG contrast", () => {
    expect(contrastRatio(parseColor("#000")!, parseColor("#fff")!)).toBeCloseTo(21, 0);
    expect(contrastRatio(parseColor("#162F6A")!, parseColor("#fff")!)).toBeGreaterThan(4.5);
  });
  it("deltaE is zero for identical colours", () => {
    expect(deltaE(parseColor("#A32966")!, parseColor("#A32966")!)).toBe(0);
  });
});
