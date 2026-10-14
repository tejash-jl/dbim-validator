import type { PageData } from "../dbim/types";

const NON_HTML = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|jpe?g|png|gif|webp|svg|mp4|mp3|avi|mov|csv|xml|json|txt|odt|ods|rtf|exe|apk)(\?|$)/i;

// Inner pages that exercise the most checklist items (§5.6 footer pages, §A.5 content sections).
const PRIORITY = [
  /about|ministry|department|who-?we-?are/i,
  /scheme|service|offering/i,
  /document|publication|report|act|polic/i,
  /contact|connect|directory/i,
  /media|photo|video|gallery/i,
  /tender|vacanc|recruit/i,
  /feedback|form|grievance/i,
  /sitemap|site-map/i,
];

function normalise(u: URL) {
  u.hash = "";
  const s = u.href.replace(/\/$/, "");
  return s;
}

/** Choose up to `max` additional same-site pages to scan, favouring navigation and footer links. */
export function pickPages(home: PageData, max: number): string[] {
  if (max <= 0) return [];
  const origin = new URL(home.finalUrl);
  const host = origin.hostname.replace(/^www\./, "");
  const seen = new Set<string>([normalise(new URL(home.finalUrl)), normalise(new URL(home.url))]);
  const candidates: { url: string; score: number }[] = [];
  for (const l of home.links) {
    let u: URL;
    try {
      u = new URL(l.href);
    } catch {
      continue;
    }
    if (u.hostname.replace(/^www\./, "") !== host || !/^https?:$/.test(u.protocol) || NON_HTML.test(u.pathname)) continue;
    const key = normalise(u);
    if (seen.has(key)) continue;
    seen.add(key);
    let score = 0;
    if (l.inNav || l.inHeader) score += 3;
    if (l.inFooter) score += 1;
    const hay = `${u.pathname} ${l.text}`;
    const pi = PRIORITY.findIndex((re) => re.test(hay));
    if (pi >= 0) score += 10 - pi;
    score -= u.pathname.split("/").filter(Boolean).length * 0.5; // prefer shallow pages
    candidates.push({ url: u.href, score });
  }
  // Pick the best page for each priority pattern first, then fill with the highest scores.
  const picked: string[] = [];
  for (const re of PRIORITY) {
    const hit = candidates.filter((c) => !picked.includes(c.url) && re.test(c.url)).sort((a, b) => b.score - a.score)[0];
    if (hit && picked.length < max) picked.push(hit.url);
  }
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    if (picked.length >= max) break;
    if (!picked.includes(c.url)) picked.push(c.url);
  }
  return picked;
}
