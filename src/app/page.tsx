import Home from "@/components/Home";
import { preferredBrowser } from "@/lib/scanner/browser";
import { headedScansAllowed, privateUrlsAllowed } from "@/lib/scanner/safety";

// Server settings decide what the form offers, so read them per request.
export const dynamic = "force-dynamic";

export default function Page() {
  return <Home caps={{ localUrls: privateUrlsAllowed(), headed: headedScansAllowed(), browser: preferredBrowser() }} />;
}
