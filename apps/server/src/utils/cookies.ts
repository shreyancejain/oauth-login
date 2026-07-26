import type { CookieOptions, Response } from "express";

const DEFAULT_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  signed: true,
  path: "/",
} as const satisfies CookieOptions;

export type AppCookieOptions = CookieOptions & {
  secure: boolean;
};

function mergeCookieOptions(options: AppCookieOptions): CookieOptions {
  return {
    ...DEFAULT_COOKIE_OPTIONS,
    ...options,
  };
}

export function setCookie(
  res: Response,
  name: string,
  value: string,
  options: AppCookieOptions,
): void {
  res.cookie(name, value, mergeCookieOptions(options));
}

export function clearCookie(
  res: Response,
  name: string,
  options: AppCookieOptions,
): void {
  const merged = mergeCookieOptions(options);
  res.clearCookie(name, {
    httpOnly: merged.httpOnly,
    sameSite: merged.sameSite,
    signed: merged.signed,
    path: merged.path,
    secure: merged.secure,
  });
}
