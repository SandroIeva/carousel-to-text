import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { supabaseServerKey } from "./supabase-config";
export function requestIpHash(req: Request) {
  let ip: string;
  if (process.env.VERCEL === "1") {
    // Vercel overwrites these at its edge. Never accept arbitrary client IP headers off Vercel.
    ip = (
      req.headers.get("x-vercel-forwarded-for") ||
      req.headers.get("x-forwarded-for") ||
      ""
    ).trim();
    if (!isIP(ip)) throw new Error("Trusted client IP is unavailable.");
  } else if (process.env.NODE_ENV !== "production") {
    ip = "127.0.0.1";
  } else {
    throw new Error("IP limits require the trusted Vercel proxy.");
  }
  if (isIP(ip) === 6) {
    ip = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    const mapped = ip.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/);
    if (mapped) {
      const n = parseInt(mapped[1], 16),
        m = parseInt(mapped[2], 16);
      ip = `${n >> 8}.${n & 255}.${m >> 8}.${m & 255}`;
    }
  }
  const key = process.env.IP_HASH_SECRET || supabaseServerKey();
  if (!key) throw new Error("IP hashing is not configured.");
  return createHmac("sha256", key)
    .update(`slide-scrape-ip:v1:${ip}`)
    .digest("hex");
}
