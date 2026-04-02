import { NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt < now) buckets.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Check rate limit for a given key.
 * Returns a 429 NextResponse if the limit is exceeded, or null if OK.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000
): NextResponse | null {
  const now = Date.now();
  let entry = buckets.get(key);

  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + windowMs };
    buckets.set(key, entry);
    return null;
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)),
        },
      }
    );
  }

  return null;
}

/**
 * Rate limit based on request IP (for auth endpoints).
 */
export function checkAuthRateLimit(request: Request): NextResponse | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return checkRateLimit(`auth:${ip}`, 20, 60_000); // 20 auth attempts per minute per IP
}
