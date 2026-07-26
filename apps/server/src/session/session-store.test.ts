import { describe, expect, it } from "vitest";
import { createSessionStore } from "./session-store.js";

describe("sessionStore expiry", () => {
  it("expires sessions after the absolute TTL", () => {
    let now = 1_000;
    const store = createSessionStore({
      absoluteTtlMs: 100,
      idleTtlMs: 10_000,
      now: () => now,
      createId: () => "sid-1",
    });

    store.create({
      accessToken: "token",
      user: {
        id: 1,
        login: "octocat",
        name: null,
        avatarUrl: "https://example.com/a.png",
      },
    });

    expect(store.get("sid-1")).toBeDefined();
    now = 1_101;
    expect(store.get("sid-1")).toBeUndefined();
  });

  it("expires sessions after the idle TTL", () => {
    let now = 1_000;
    const store = createSessionStore({
      absoluteTtlMs: 10_000,
      idleTtlMs: 100,
      now: () => now,
      createId: () => "sid-2",
    });

    store.create({
      accessToken: "token",
      user: {
        id: 1,
        login: "octocat",
        name: null,
        avatarUrl: "https://example.com/a.png",
      },
    });

    now = 1_050;
    expect(store.touch("sid-2")).toBeDefined();
    now = 1_200;
    expect(store.get("sid-2")).toBeUndefined();
  });
});
