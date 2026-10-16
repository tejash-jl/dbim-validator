import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import { getScan } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Renders the report page in print mode and returns it as a PDF. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = getScan(id);
  if (!scan || scan.status !== "done") return NextResponse.json({ error: "Report not ready" }, { status: 404 });
  const origin = process.env.APP_ORIGIN || req.nextUrl.origin;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/scans/${id}?print=1`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForSelector("[data-report-ready]", { timeout: 30_000 });
    // Screenshots are part of the PDF: wait until every image has loaded (or failed and been hidden).
    await page
      .waitForFunction(() => Array.from(document.images).every((img) => img.complete), null, { timeout: 30_000 })
      .catch(() => {});
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" } });
    const host = new URL(scan.url).hostname.replace(/[^\w.-]/g, "");
    return new NextResponse(Buffer.from(pdf), {
      // ?inline=1 opens the PDF in the browser's viewer (Preview PDF); otherwise it downloads.
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="dbim-report-${host}-${id}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
