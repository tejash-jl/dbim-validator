import dns from "node:dns/promises";
import net from "node:net";

/**
 * Whether this server lets users scan localhost and private-network URLs (sites running on your own
 * machine or intranet). On by default for local use (`npm run dev`), off by default in production
 * (`npm start`), where it would let anyone reach the server's internal network (SSRF).
 * ALLOW_PRIVATE_URLS=1 or =0 overrides the default.
 */
export function privateUrlsAllowed(): boolean {
  const v = process.env.ALLOW_PRIVATE_URLS;
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/** localhost, *.localhost, loopback and private-network addresses. */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || (net.isIP(host) > 0 && isPrivateIp(host));
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

const cache = new Map<string, Promise<boolean>>();

/** True when the host resolves only to public addresses, or when private URLs are allowed for this scan. */
export function isHostAllowed(hostname: string, allowPrivate = false): Promise<boolean> {
  if (allowPrivate) return Promise.resolve(true);
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return Promise.resolve(false);
  if (net.isIP(host)) return Promise.resolve(!isPrivateIp(host));
  let p = cache.get(host);
  if (!p) {
    p = dns
      .lookup(host, { all: true })
      .then((addrs) => addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address)))
      .catch(() => false);
    cache.set(host, p);
  }
  return p;
}

export async function validateScanUrl(raw: string, allowPrivate = false): Promise<URL> {
  let url: URL;
  const input = raw.trim();
  const hasScheme = /^https?:\/\//i.test(input);
  try {
    url = new URL(hasScheme ? input : `https://${input}`);
  } catch {
    throw new Error("Not a valid URL");
  }
  // "localhost:3000" almost always means a plain-http dev server.
  if (!hasScheme && isLocalHost(url.hostname)) url.protocol = "http:";
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http(s) URLs can be scanned");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed");
  if (!(await isHostAllowed(url.hostname, allowPrivate)))
    throw new Error(
      isLocalHost(url.hostname)
        ? "Scanning localhost and private-network addresses is turned off on this server (set ALLOW_PRIVATE_URLS=1 to allow it)"
        : "This host resolves to a private or reserved address",
    );
  url.hash = "";
  return url;
}

/** Registrable-ish site key, aware of Indian second-level domains. */
export function siteKey(hostname: string): string {
  if (net.isIP(hostname.replace(/^\[|\]$/g, "")) || !hostname.includes(".")) return hostname.toLowerCase();
  const labels = hostname.toLowerCase().replace(/^www\./, "").split(".");
  const sld = labels.slice(-2).join(".");
  if (["gov.in", "nic.in", "co.in", "org.in", "ac.in", "net.in", "edu.in", "res.in", "gen.in", "firm.in", "ind.in"].includes(sld))
    return labels.slice(-3).join(".");
  return sld;
}

/** Visible browser windows only make sense on the machine you are sitting at, never on a hosted server. */
export function headedScansAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}
