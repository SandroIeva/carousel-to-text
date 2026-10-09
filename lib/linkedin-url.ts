import "server-only";
import { normalizeUrl } from "./core";

export async function resolveLinkedInUrl(url: string): Promise<string> {
  const source = normalizeUrl(url);
  if (new URL(source).hostname !== "www.linkedin.com" || !/-ugcPost-\d+-/.test(source)) return source;
  try {
    const response = await fetch(source, {
      redirect: "error",
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/html")) throw new Error();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 1000000) throw new Error();
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const html = Buffer.concat(chunks).toString("utf8");
    for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
      if (!/\brel\s*=\s*["']canonical["']/i.test(tag)) continue;
      const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!href) continue;
      const canonical = normalizeUrl(href.replace(/&amp;/g, "&"));
      const slug = (value: string) => value.replace(/-(?:ugcPost|activity)-\d+-[A-Za-z0-9_-]+$/, "");
      if (new URL(canonical).hostname === "www.linkedin.com" && /-activity-\d+-/.test(canonical) && slug(source) === slug(canonical)) return canonical;
    }
  } catch {
    // Do not expose upstream response bodies or fetch details.
  }
  throw new Error("Could not resolve this public LinkedIn post. Please try again or check that the post is publicly accessible.");
}
