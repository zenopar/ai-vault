import { headers } from "next/headers";

/**
 * Retrieves the client IP address from Next.js headers.
 * Supports Cloudflare (cf-connecting-ip) and standard proxies (x-forwarded-for).
 */
export async function getClientIp(): Promise<string> {
  const headersList = await headers();
  
  // Cloudflare injects this header with the real client IP
  const cfIp = headersList.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }

  // Standard reverse proxy header (can be a comma-separated list of IPs)
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) {
    // If there are multiple IPs (e.g. proxy chains), the real client IP is usually the first one
    return forwardedFor.split(",")[0].trim();
  }

  return "unknown-ip";
}
