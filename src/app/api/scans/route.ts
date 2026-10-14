import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { createScan, listScans, queueDepth } from "@/lib/db";
import { DEFAULT_OPTIONS } from "@/lib/dbim/types";
import { validateScanUrl } from "@/lib/scanner/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  urls: z.array(z.string().min(1).max(2048)).min(1).max(20),
  orgType: z.enum(["ministry", "org-emblem", "org-no-emblem"]),
  maxPages: z.number().int().min(1).max(15).default(DEFAULT_OPTIONS.maxPages),
  lighthouse: z.boolean().default(true),
  checkLinks: z.boolean().default(true),
  checkPdfs: z.boolean().default(true),
  ai: z.boolean().default(true),
});

// Simple per-IP rate limit: 30 scans per hour.
const hits = new Map<string, number[]>();
function rateLimited(ip: string, n: number) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length + n > 30) return true;
  hits.set(ip, [...recent, ...Array(n).fill(now)]);
  return false;
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  const { urls, ...rest } = parsed.data;
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(ip, unique.length)) return NextResponse.json({ error: "Rate limit reached (30 scans per hour). Try again later." }, { status: 429 });
  if (queueDepth() + unique.length > 100) return NextResponse.json({ error: "The scan queue is full. Try again in a few minutes." }, { status: 503 });

  const valid: string[] = [];
  const errors: { url: string; error: string }[] = [];
  for (const u of unique) {
    try {
      valid.push((await validateScanUrl(u)).href);
    } catch (e) {
      errors.push({ url: u, error: (e as Error).message });
    }
  }
  if (!valid.length) return NextResponse.json({ error: errors.map((e) => `${e.url}: ${e.error}`).join("\n") || "No valid URLs", errors }, { status: 400 });
  const batchId = valid.length > 1 ? crypto.randomBytes(6).toString("base64url") : null;
  const ids = valid.map((u) => createScan(u, { ...DEFAULT_OPTIONS, ...rest }, batchId));
  return NextResponse.json({ ids, batchId, errors }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const batch = req.nextUrl.searchParams.get("batch") ?? undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 30);
  return NextResponse.json({ scans: listScans({ batch, limit }) });
}
