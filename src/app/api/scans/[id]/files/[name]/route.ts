import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { scanDir } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await params;
  if (!/^[\w-]{6,20}$/.test(id) || !/^p\d{1,2}-(desktop|mobile|header|footer|fold)\.jpg$/.test(name)) return new NextResponse("Not found", { status: 404 });
  const file = path.join(scanDir(id), name);
  if (!fs.existsSync(file)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(fs.readFileSync(file), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
}
