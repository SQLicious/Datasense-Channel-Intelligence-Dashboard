import { createHash } from "node:crypto";

export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  if (process.env.VERCEL !== "1") {
    return "local-development";
  }

  return undefined;
}

export function hashClientIp(ip: string | undefined): string | undefined {
  if (!ip) {
    return undefined;
  }

  return createHash("sha256").update(ip).digest("hex");
}
