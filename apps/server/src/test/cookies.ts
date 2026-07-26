export function asCookieHeader(
  setCookie: string | string[] | undefined,
): string[] {
  if (!setCookie) {
    return [];
  }
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  return list.filter((value): value is string => typeof value === "string");
}
