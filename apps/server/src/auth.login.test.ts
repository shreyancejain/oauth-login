import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { GitHubClient } from "./oauth/github-client.js";
import { createPendingOAuthStore } from "./oauth/state-store.js";
import { createSessionStore } from "./session/session-store.js";
import { createRateLimiter } from "./middleware/rate-limit-auth.js";
import { asCookieHeader } from "./test/cookies.js";

const testConfig = loadConfig({
  PORT: "3000",
  NODE_ENV: "test",
  FRONTEND_URL: "http://localhost:5173",
  OAUTH_REDIRECT_URI: "http://localhost:3000/auth/callback",
  OAUTH_CLIENT_ID: "test-client-id",
  OAUTH_CLIENT_SECRET: "test-client-secret",
  SESSION_SECRET: "a".repeat(32),
  COOKIE_SECURE: "false",
});

const fakeGitHub: GitHubClient = {
  exchangeCode: async () => ({ accessToken: "token" }),
  getCurrentUser: async () => ({
    id: 1,
    login: "octocat",
    name: "The Octocat",
    avatarUrl: "https://example.com/avatar.png",
  }),
  listRepositories: async () => ({
    repositories: [],
    page: 1,
    perPage: 10,
    hasNext: false,
  }),
};

const pendingOAuthStore = createPendingOAuthStore();
const rateLimiter = createRateLimiter({
  windowMs: testConfig.authRateLimitWindowMs,
  max: testConfig.authRateLimitMax,
});

function buildTestApp() {
  return createApp({
    config: testConfig,
    githubClient: fakeGitHub,
    pendingOAuthStore,
    sessionStore: createSessionStore({
      absoluteTtlMs: testConfig.sessionAbsoluteTtlMs,
      idleTtlMs: testConfig.sessionIdleTtlMs,
    }),
    authRateLimiter: rateLimiter,
  });
}

describe("GET /auth/login", () => {
  beforeEach(() => {
    rateLimiter.reset();
  });

  it("redirects to GitHub with state, code_challenge, and read:user scope", async () => {
    const app = buildTestApp();
    const response = await request(app).get("/auth/login");

    expect(response.status).toBe(302);
    const location = response.headers.location;
    expect(location).toBeDefined();

    const url = new URL(location!);
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/auth/callback",
    );
    expect(url.searchParams.get("scope")).toBe("read:user");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");

    const state = url.searchParams.get("state");
    const challenge = url.searchParams.get("code_challenge");
    expect(state).toBeTruthy();
    expect(challenge).toBeTruthy();
    expect(pendingOAuthStore.get(state!)).toBeDefined();
  });

  it("sets a signed HttpOnly oauth_state cookie", async () => {
    const app = buildTestApp();
    const response = await request(app).get("/auth/login");

    const cookies = asCookieHeader(response.headers["set-cookie"]);
    const oauthCookie = cookies.find((c) => c.startsWith("oauth_state="));
    expect(oauthCookie).toBeDefined();
    expect(oauthCookie).toMatch(/HttpOnly/i);
    expect(oauthCookie).toMatch(/SameSite=Lax/i);
    expect(oauthCookie).toMatch(/Path=\/auth/i);
  });

  it("rate limits excessive login attempts", async () => {
    const limited = createRateLimiter({ windowMs: 60_000, max: 2 });
    const app = createApp({
      config: testConfig,
      githubClient: fakeGitHub,
      pendingOAuthStore: createPendingOAuthStore(),
      sessionStore: createSessionStore({
        absoluteTtlMs: testConfig.sessionAbsoluteTtlMs,
        idleTtlMs: testConfig.sessionIdleTtlMs,
      }),
      authRateLimiter: limited,
    });

    expect((await request(app).get("/auth/login")).status).toBe(302);
    expect((await request(app).get("/auth/login")).status).toBe(302);
    const blocked = await request(app).get("/auth/login");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: "rate_limited" });
  });
});
