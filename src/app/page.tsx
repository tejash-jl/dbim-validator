import Home from "@/components/Home";
import { ALL_RULES, CATEGORY_ORDER } from "@/lib/dbim/engine";
import { preferredBrowser } from "@/lib/scanner/browser";
import { headedScansAllowed, privateUrlsAllowed } from "@/lib/scanner/safety";

// Server settings decide what the form offers, so read them per request.
export const dynamic = "force-dynamic";

/** DBIM section each chapter tile cites. */
const CHAPTER_SECTION: Record<string, string> = {
  Colours: "§2", Iconography: "§3", Typography: "§4", "Header & Footer": "§5.4", Logo: "§5", Imagery: "§6", Content: "§7",
  Search: "§9", Performance: "§10", Accessibility: "WCAG 2.1", Forms: "§A.6", "Ministry website": "Annexure A",
};

export default function Page() {
  const chapters = CATEGORY_ORDER.map((name) => ({ name, count: ALL_RULES.filter((r) => r.category === name).length, section: CHAPTER_SECTION[name] ?? "" })).filter((c) => c.count);
  return (
    <Home
      caps={{ localUrls: privateUrlsAllowed(), headed: headedScansAllowed(), browser: preferredBrowser() }}
      chapters={chapters}
      totalChecks={ALL_RULES.length}
    />
  );
}
