import type { Metadata } from "next";
import ReportView from "@/components/ReportView";

export const metadata: Metadata = { title: "Scan report", robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const { id } = await params;
  const { print } = await searchParams;
  return <ReportView id={id} print={print === "1"} />;
}
