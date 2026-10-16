import { PDFDocument, PDFDict, PDFName, PDFBool } from "pdf-lib";
import type { LinkCheck, PageData, PdfCheck } from "../dbim/types";
import { isHostAllowed } from "./safety";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 DBIM-Validator/1.0";

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

async function safeFetch(url: string, opts: RequestInit & { timeoutMs?: number; allowPrivate?: boolean }, hops = 5): Promise<Response> {
  const { timeoutMs, allowPrivate, ...init } = opts;
  let current = url;
  for (let h = 0; h <= hops; h++) {
    const u = new URL(current);
    if (!(await isHostAllowed(u.hostname, allowPrivate))) throw new Error("blocked: private address");
    const res = await fetch(current, {
      ...init,
      redirect: "manual",
      headers: { "user-agent": UA, accept: "*/*", ...(init.headers || {}) },
      signal: AbortSignal.timeout(timeoutMs ?? 15_000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).href;
      continue;
    }
    return res;
  }
  throw new Error("too many redirects");
}

/** §7.1.3.3 / A.5.6 x — links must be valid and use HTTPS. Checks unique links across scanned pages. */
export async function checkLinks(pages: PageData[], allowPrivate = false, limit = 150): Promise<LinkCheck[]> {
  const unique = new Map<string, string>();
  for (const p of pages)
    for (const l of p.links) {
      const u = l.href.split("#")[0];
      if (!/^https?:/i.test(u) || unique.has(u)) continue;
      unique.set(u, p.finalUrl);
    }
  const list = [...unique.entries()].slice(0, limit);
  return pool(list, 8, async ([url, foundOn]) => {
    try {
      let res = await safeFetch(url, { method: "HEAD", timeoutMs: 12_000, allowPrivate });
      if (res.status === 405 || res.status === 403 || res.status === 501) res = await safeFetch(url, { method: "GET", timeoutMs: 15_000, allowPrivate });
      await res.body?.cancel().catch(() => {});
      return { url, status: res.status, ok: res.status < 400, foundOn };
    } catch (e) {
      return { url, status: null, ok: false, error: (e as Error).message.slice(0, 120), foundOn };
    }
  });
}

/** §7.1.3.3 / A.5.6 vii — documents must be accessible (tagged) PDFs; §A.5.3 — ≤ 5 MB recommended. */
export async function checkPdfs(pages: PageData[], allowPrivate = false, limit = 8): Promise<PdfCheck[]> {
  const urls = new Set<string>();
  for (const p of pages)
    for (const l of p.links)
      if (/\.pdf(\?|$)/i.test(new URL(l.href).pathname + new URL(l.href).search) || /\.pdf$/i.test(l.href)) urls.add(l.href.split("#")[0]);
  const list = [...urls].slice(0, limit);
  return pool(list, 3, async (url): Promise<PdfCheck> => {
    const base: PdfCheck = { url, bytes: null, tagged: null, hasStructTree: null, hasLang: null, hasTitle: null };
    try {
      const res = await safeFetch(url, { method: "GET", timeoutMs: 40_000, allowPrivate });
      if (!res.ok) return { ...base, error: `HTTP ${res.status}` };
      const declared = Number(res.headers.get("content-length") || 0);
      if (declared > 40 * 1024 * 1024) {
        await res.body?.cancel();
        return { ...base, bytes: declared, error: "Too large to analyse (> 40 MB)" };
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      base.bytes = buf.byteLength;
      if (String.fromCharCode(...buf.slice(0, 5)) !== "%PDF-") return { ...base, error: "Link does not return a PDF" };
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
      const cat = doc.catalog;
      const markInfo = cat.lookupMaybe(PDFName.of("MarkInfo"), PDFDict);
      const marked = markInfo?.lookupMaybe(PDFName.of("Marked"), PDFBool);
      return {
        ...base,
        tagged: marked ? marked.asBoolean() : false,
        hasStructTree: cat.has(PDFName.of("StructTreeRoot")),
        hasLang: cat.has(PDFName.of("Lang")),
        hasTitle: !!doc.getTitle(),
      };
    } catch (e) {
      return { ...base, error: (e as Error).message.slice(0, 160) };
    }
  });
}
