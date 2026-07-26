import { describe, expect, it } from "vitest";
import { linkHeaderHasNext, parsePageQuery } from "./pagination.js";

describe("parsePageQuery", () => {
  it("defaults missing values to page 1", () => {
    expect(parsePageQuery(undefined)).toBe(1);
    expect(parsePageQuery("")).toBe(1);
  });

  it("parses valid pages", () => {
    expect(parsePageQuery("1")).toBe(1);
    expect(parsePageQuery("12")).toBe(12);
  });

  it("rejects invalid pages", () => {
    expect(parsePageQuery("0")).toBeNull();
    expect(parsePageQuery("-1")).toBeNull();
    expect(parsePageQuery("1.5")).toBeNull();
    expect(parsePageQuery("abc")).toBeNull();
  });
});

describe("linkHeaderHasNext", () => {
  it("detects rel=next", () => {
    expect(
      linkHeaderHasNext(
        '<https://api.github.com/user/repos?page=2>; rel="next"',
      ),
    ).toBe(true);
  });

  it("returns false when next is absent", () => {
    expect(
      linkHeaderHasNext(
        '<https://api.github.com/user/repos?page=1>; rel="prev"',
      ),
    ).toBe(false);
    expect(linkHeaderHasNext(null)).toBe(false);
  });
});
