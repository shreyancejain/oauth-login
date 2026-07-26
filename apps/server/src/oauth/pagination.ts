export const DEFAULT_REPOS_PER_PAGE = 10;

export function parsePageQuery(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return 1;
  }
  if (typeof value !== "string") {
    return null;
  }
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) {
    return null;
  }
  return page;
}

export function linkHeaderHasNext(linkHeader: string | null): boolean {
  if (!linkHeader) {
    return false;
  }
  return /rel="next"/i.test(linkHeader);
}
