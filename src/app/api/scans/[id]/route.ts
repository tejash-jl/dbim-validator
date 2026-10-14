import { NextRequest, NextResponse } from "next/server";
import { getScan, previousScan } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = getScan(id);
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  if (req.nextUrl.searchParams.get("download") === "json") {
    return new NextResponse(JSON.stringify(scan.report, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="dbim-report-${id}.json"` },
    });
  }
  const prev = scan.status === "done" ? previousScan(scan) : null;
  return NextResponse.json({
    scan,
    previous: prev
      ? { id: prev.id, created_at: prev.created_at, score: prev.score, statuses: Object.fromEntries((prev.report?.results ?? []).map((r) => [r.id, r.status])) }
      : null,
  });
}
