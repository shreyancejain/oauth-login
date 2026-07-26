import { describe, expect, it } from "vitest";
import { createLruCache } from "./lru-cache.js";

describe("createLruCache", () => {
  it("returns undefined for an empty cache", () => {
    const cache = createLruCache<string, string>(5);
    expect(cache.get("a")).toBeUndefined();
  });

  it("updates recency on get so a recently used key is not evicted", () => {
    const cache = createLruCache<string, string>(5);
    cache.set("a", "A");
    cache.set("b", "B");
    cache.set("c", "C");
    cache.set("d", "D");
    cache.set("e", "E");

    expect(cache.get("a")).toBe("A");
    cache.set("f", "F");

    expect(cache.get("a")).toBe("A");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("f")).toBe("F");
  });

  it("evicts least recently used when over capacity", () => {
    const cache = createLruCache<string, string>(5);
    for (const key of ["a", "b", "c", "d", "e"]) {
      cache.set(key, key.toUpperCase());
    }
    cache.set("f", "F");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("B");
  });

  it("deletes keys by prefix", () => {
    const cache = createLruCache<string, string>(5);
    cache.set("repos:s1:page:1", "one");
    cache.set("repos:s1:page:2", "two");
    cache.set("repos:s2:page:1", "other");

    cache.deleteByPrefix("repos:s1:");

    expect(cache.get("repos:s1:page:1")).toBeUndefined();
    expect(cache.get("repos:s2:page:1")).toBe("other");
  });
});
