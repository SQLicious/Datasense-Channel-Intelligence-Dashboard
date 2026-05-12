import type { ResponseCookies } from "next/dist/server/web/spec-extension/cookies";

const cookiePrefix = "datasense_youtube_";

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export type OwnerOAuthCookie = {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
};

export function readOwnerOAuthCookie(cookies: CookieReader): OwnerOAuthCookie | undefined {
  const refreshToken = cookies.get(`${cookiePrefix}refresh`)?.value;

  if (!refreshToken) {
    return undefined;
  }

  const expiryRaw = cookies.get(`${cookiePrefix}expiry`)?.value;

  return {
    refreshToken,
    accessToken: cookies.get(`${cookiePrefix}access`)?.value,
    expiryDate: expiryRaw ? Number(expiryRaw) : undefined
  };
}

export function writeOwnerOAuthCookie(cookies: ResponseCookies, oauth: OwnerOAuthCookie): void {
  const baseOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  };

  cookies.set(`${cookiePrefix}refresh`, oauth.refreshToken, baseOptions);

  if (oauth.accessToken) {
    cookies.set(`${cookiePrefix}access`, oauth.accessToken, {
      ...baseOptions,
      maxAge: 60 * 60
    });
  }

  if (oauth.expiryDate) {
    cookies.set(`${cookiePrefix}expiry`, String(oauth.expiryDate), baseOptions);
  }
}
