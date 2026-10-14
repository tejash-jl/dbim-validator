import { NextResponse } from "next/server";
import { createScan, getScan } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = getScan(id);
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  const newId = createScan(scan.url, scan.options, null);
  return NextResponse.json({ id: newId }, { status: 201 });
}
