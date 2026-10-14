import type { Status } from "@/lib/dbim/types";

export const STATUS_LABEL: Record<Status, string> = { pass: "Pass", fail: "Fail", warn: "Warning", manual: "Review", na: "N/A", error: "Error" };
export const ORG_LABEL: Record<string, string> = { ministry: "Ministry / Department", "org-emblem": "Org. with emblem", "org-no-emblem": "Org. without emblem" };

export function scoreColour(score: number) {
  return score >= 85 ? "var(--pass)" : score >= 60 ? "#ffc107" : "var(--fail)";
}

export function ScoreRing({ score, size = 128 }: { score: number; size?: number }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  return (
    <div className="score-ring" style={{ width: size, height: size }} role="img" aria-label={`Compliance score ${score} out of 100`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--linen)" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreColour(score)} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="val"><div><strong>{score}</strong><small>of 100</small></div></div>
    </div>
  );
}

export function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function hostOf(u: string) {
  try {
    const x = new URL(u);
    return x.hostname.startsWith("xn--") || x.hostname.includes(".xn--") ? x.hostname : x.hostname + (x.pathname === "/" ? "" : x.pathname);
  } catch {
    return u;
  }
}
