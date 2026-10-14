import dns from "node:dns/promises";
import net from "node:net";

const allowPrivate = () => process.env.ALLOW_PRIVATE_URLS === "1";

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

/** True when the host resolves only to public addresses (or private URLs are explicitly allowed). */
export function isHostAllowed(hostname: string): Promise<boolean> {
  if (allowPrivate()) return Promise.resolve(true);
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

export async function validateScanUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new Error("Not a valid URL");
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http(s) URLs can be scanned");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed");
  if (!(await isHostAllowed(url.hostname))) throw new Error("This host resolves to a private or reserved address");
  url.hash = "";
  return url;
}

/** Registrable-ish site key, aware of Indian second-level domains. */
export function siteKey(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/^www\./, "").split(".");
  const sld = labels.slice(-2).join(".");
  if (["gov.in", "nic.in", "co.in", "org.in", "ac.in", "net.in", "edu.in", "res.in", "gen.in", "firm.in", "ind.in"].includes(sld))
    return labels.slice(-3).join(".");
  return sld;
}
