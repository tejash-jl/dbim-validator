import type { Status } from "@/lib/dbim/types";

export const STATUS_LABEL: Record<Status, string> = { pass: "Pass", fail: "Fail", warn: "Warning", manual: "Review", na: "N/A", error: "Error" };
export const SOURCE_LABEL: Record<string, string> = { web: "Web", cli: "CLI" };
export const SOURCE_TITLE: Record<string, string> = { web: "Started from the web app", cli: "Started from the command line (npm run scan)" };

/** Stages a scan was told to skip, e.g. ["Lighthouse", "AI review"]. */
export function skippedStages(o: { lighthouse?: boolean; ai?: boolean; checkLinks?: boolean; checkPdfs?: boolean } | null | undefined) {
  if (!o) return [];
  return [o.lighthouse === false && "Lighthouse", o.checkLinks === false && "link check", o.checkPdfs === false && "PDF check", o.ai === false && "AI review"].filter(Boolean) as string[];
}

export const ORG_LABEL: Record<string, string> = { ministry: "Ministry / Department", "org-emblem": "Org. with emblem", "org-no-emblem": "Org. without emblem" };

/** Colour for a score: pass ≥ 85, warning ≥ 60, otherwise fail. `onDark` lightens fail red for the blue report band. */
export function scoreColour(score: number, onDark = false) {
  return score >= 85 ? (onDark ? "#5fd39a" : "var(--pass)") : score >= 60 ? (onDark ? "#ffd666" : "#c99400") : onDark ? "#ff8a95" : "var(--fail)";
}

/** The brand mark: a strip of DBIM Blue tints (a colour swatch) beside a check. */
export function Mark({ size = 40, inverse = false }: { size?: number; inverse?: boolean }) {
  const small = size <= 20;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="icon">
      <rect width="40" height="40" rx="10" fill={inverse ? "#fff" : "#162F6A"} />
      {!small && (
        <>
          <rect x="7" y="8" width="5" height="24" rx="2" fill="#D2DFFF" />
          <rect x="7" y="8" width="5" height="18" rx="2" fill="#A3BBF3" />
          <rect x="7" y="8" width="5" height="12" rx="2" fill="#5279D7" />
        </>
      )}
      <path d={small ? "M12 21l6 6 12-14" : "M17 21l5 5 10-12"} fill="none" stroke={inverse ? "#162F6A" : "#fff"} strokeWidth={small ? 5 : 3.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One line-icon style (DBIM §3.3): 24px grid, 2px stroke, round caps. */
const ICONS = {
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M5 12l5 5 9-10",
  checkCircle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6",
  chevron: "M6 9l6 6 6-6",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  monitor: "M3 4h18v13H3zM8 21h8M12 17v4",
  star: "M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v4M12 16h.01",
  github: "M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.7A5.2 5.2 0 0 0 20 4.8 4.9 4.9 0 0 0 19.9 1S18.7.7 16 2.5a13.4 13.4 0 0 0-7 0C6.3.7 5.1 1 5.1 1A4.9 4.9 0 0 0 5 4.8a5.2 5.2 0 0 0-1.4 3.6c0 5.2 3.2 6.4 6.2 6.7a3.4 3.4 0 0 0-.9 2.6V22",
  // Chapters
  Colours: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-.9-.7-1.4-.7-2.2 0-.9.8-1.7 1.7-1.7H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01",
  Iconography: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6M14 17h6",
  Typography: "M4 7V5h16v2M9 19h6M12 5v14",
  "Header & Footer": "M3 4h18v16H3zM3 9h18M3 16h18",
  Logo: "M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z",
  Imagery: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01",
  Content: "M5 4h14v16H5zM9 8h6M9 12h6M9 16h4",
  Search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  Performance: "M12 13l4-4M4 18a9 9 0 1 1 16 0",
  Accessibility: "M12 4.5h.01M5 8l7 1.5L19 8M12 9.5V14l-3 6M12 14l3 6",
  Forms: "M5 5h14v4H5zM5 13h14v4H5zM8 7h.01M8 15h.01",
  "Ministry website": "M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24, label, strokeWidth = 2 }: { name: string; size?: number; label?: string; strokeWidth?: number }) {
  const d = ICONS[name as IconName] ?? ICONS.checkCircle;
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      <path d={d} />
    </svg>
  );
}

/** Large score ring for the report band (white text on DBIM Blue, or dark text in print). */
export function ScoreRing({ score, size = 132, onDark = true }: { score: number; size?: number; onDark?: boolean }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  return (
    <div className="score-ring" style={{ width: size, height: size }} role="img" aria-label={`Compliance score ${score} out of 100`}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={onDark ? "rgba(210,223,255,0.18)" : "#e9edf5"} strokeWidth="12" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreColour(score, onDark)} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="val"><div><strong style={{ color: onDark ? "#fff" : "var(--text)" }}>{score}</strong><small style={{ color: onDark ? "var(--blue-5)" : "var(--muted)" }}>of 100</small></div></div>
    </div>
  );
}

/** Small ring for scan cards; shows a label instead of a score while a scan runs or after it fails. */
export function MiniRing({ score, label, size = 64 }: { score: number | null; label?: string; size?: number }) {
  const fill = score == null ? "#e9edf5" : `conic-gradient(${scoreColour(score)} ${score * 3.6}deg, #e9edf5 0)`;
  return (
    <span className={`ring${score == null ? " ring-pending" : ""}`} style={{ width: size, height: size, background: fill }} aria-hidden="true">
      <span style={{ width: size - 12, height: size - 12, fontSize: score == null ? 12 : 20 }}>{score ?? label ?? "—"}</span>
    </span>
  );
}

export function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function hostOf(u: string) {
  try {
    const x = new URL(u);
    return x.hostname.startsWith("xn--") || x.hostname.includes(".xn--") ? x.hostname : x.host + (x.pathname === "/" ? "" : x.pathname);
  } catch {
    return u;
  }
}
