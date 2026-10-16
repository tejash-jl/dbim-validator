import { NextResponse } from "next/server";
import { createScan, getScan } from "@/lib/db";
import { headedScansAllowed, privateUrlsAllowed, validateScanUrl } from "@/lib/scanner/safety";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = getScan(id);
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  // Re-apply the current server policy instead of trusting the stored options.
  const allowPrivate = privateUrlsAllowed();
  try {
    await validateScanUrl(scan.url, allowPrivate);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const newId = createScan(scan.url, { ...scan.options, allowPrivate, headed: !!scan.options.headed && headedScansAllowed() }, null);
  return NextResponse.json({ id: newId }, { status: 201 });
}
