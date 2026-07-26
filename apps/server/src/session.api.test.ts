import { beforeEach, describe, expect, it } from "vitest";
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
  exchangeCode: async () => ({ accessToken: "gho_secret_token" }),
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
const sessionStore = createSessionStore({
  absoluteTtlMs: testConfig.sessionAbsoluteTtlMs,
  idleTtlMs: testConfig.sessionIdleTtlMs,
});
const rateLimiter = createRateLimiter({
  windowMs: testConfig.authRateLimitWindowMs,
  max: testConfig.authRateLimitMax,
});

function buildApp() {
  return createApp({
    config: testConfig,
    githubClient: fakeGitHub,
    pendingOAuthStore,
    sessionStore,
    authRateLimiter: rateLimiter,
  });
}

async function loginAndGetSidCookie(app: ReturnType<typeof buildApp>) {
  const login = await request(app).get("/auth/login");
  const location = new URL(login.headers.location!);
  const state = location.searchParams.get("state")!;
  const loginCookieList = asCookieHeader(login.headers["set-cookie"]);

  const callback = await request(app)
    .get(`/auth/callback?code=abc&state=${state}`)
    .set("Cookie", loginCookieList);

  const cookieList = asCookieHeader(callback.headers["set-cookie"]);
  const sid = cookieList.find((c) => c.startsWith("sid="));
  if (!sid) {
    throw new Error("missing sid cookie");
  }
  return sid;
}

describe("session API", () => {
  beforeEach(() => {
    rateLimiter.reset();
  });

  it("rejects unauthenticated /api/me", async () => {
    const app = buildApp();
    const response = await request(app).get("/api/me");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "unauthenticated" });
  });

  it("returns the current user for a valid session", async () => {
    const app = buildApp();
    const sid = await loginAndGetSidCookie(app);
    const response = await request(app).get("/api/me").set("Cookie", sid);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 1,
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://example.com/avatar.png",
    });
    expect(JSON.stringify(response.body)).not.toMatch(/gho_secret_token/);
  });

  it("rejects logout without a same-origin header", async () => {
    const app = buildApp();
    const sid = await loginAndGetSidCookie(app);
    const response = await request(app).post("/auth/logout").set("Cookie", sid);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "forbidden" });
  });

  it("logs out and invalidates the session", async () => {
    const app = buildApp();
    const sid = await loginAndGetSidCookie(app);

    const logout = await request(app)
      .post("/auth/logout")
      .set("Cookie", sid)
      .set("Origin", "http://localhost:5173");

    expect(logout.status).toBe(204);

    const me = await request(app).get("/api/me").set("Cookie", sid);
    expect(me.status).toBe(401);
  });
});
