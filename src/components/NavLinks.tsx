"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Main navigation; marks the current section for screen readers and styling. */
export default function NavLinks({ github }: { github: React.ReactNode }) {
  const path = usePathname();
  const current = (href: string) => (href === "/" ? path === "/" || path.startsWith("/scans") : path.startsWith(href)) ? "page" : undefined;
  return (
    <nav aria-label="Main">
      <Link href="/" aria-current={current("/")}>New scan</Link>
      <Link href="/methodology" aria-current={current("/methodology")}>Checks &amp; methodology</Link>
      <a href="https://github.com/tejash-jl/dbim-validator" target="_blank" rel="noreferrer">{github}GitHub</a>
    </nav>
  );
}
