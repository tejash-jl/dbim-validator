import { afterEach, describe, expect, it, vi } from "vitest";
import { explainLoadError } from "../src/lib/scanner/run";
import { isLocalHost, privateUrlsAllowed, siteKey, validateScanUrl } from "../src/lib/scanner/safety";

afterEach(() => vi.unstubAllEnvs());

describe("local and private URLs", () => {
  it("allows local URLs by default in development and blocks them in production", () => {
    vi.stubEnv("ALLOW_PRIVATE_URLS", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(privateUrlsAllowed()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(privateUrlsAllowed()).toBe(false);
  });

  it("lets ALLOW_PRIVATE_URLS override the default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_PRIVATE_URLS", "1");
    expect(privateUrlsAllowed()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_PRIVATE_URLS", "0");
    expect(privateUrlsAllowed()).toBe(false);
  });

  it("rejects localhost unless the scan allows private URLs", async () => {
    await expect(validateScanUrl("http://localhost:3000")).rejects.toThrow(/turned off on this server/);
    await expect(validateScanUrl("http://10.0.0.5")).rejects.toThrow();
    expect((await validateScanUrl("http://127.0.0.1:8080/app", true)).href).toBe("http://127.0.0.1:8080/app");
  });

  it("defaults scheme-less local hosts to http and others to https", async () => {
    expect((await validateScanUrl("localhost:3000", true)).href).toBe("http://localhost:3000/");
    expect((await validateScanUrl("192.168.1.20:8080/site", true)).protocol).toBe("http:");
    expect((await validateScanUrl("example.gov.in", true)).protocol).toBe("https:");
  });

  it("recognises local hosts", () => {
    for (const h of ["localhost", "app.localhost", "127.0.0.1", "192.168.1.9", "[::1]", "printer.local"]) expect(isLocalHost(h), h).toBe(true);
    for (const h of ["www.india.gov.in", "8.8.8.8"]) expect(isLocalHost(h), h).toBe(false);
  });

  it("keys IP addresses and single-label hosts by the whole host", () => {
    expect(siteKey("127.0.0.1")).toBe("127.0.0.1");
    expect(siteKey("localhost")).toBe("localhost");
    expect(siteKey("www.meity.gov.in")).toBe("meity.gov.in");
  });
});

describe("load errors", () => {
  it("explains common navigation failures", () => {
    const err = (m: string) => new Error(m);
    expect(explainLoadError(err("page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/"), new URL("http://localhost:5173/"))).toMatch(/Nothing is running at localhost:5173/);
    expect(explainLoadError(err("page.goto: Timeout 60000ms exceeded."), new URL("http://jk.smartpds.nic.in/"))).toMatch(/did not respond within 60 seconds/);
    expect(explainLoadError(err("net::ERR_NAME_NOT_RESOLVED"), new URL("https://nope.gov.in/"))).toMatch(/could not be found/);
  });
});
