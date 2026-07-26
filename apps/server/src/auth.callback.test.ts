import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { GitHubClient } from "./oauth/github-client.js";
import { createPendingOAuthStore } from "./oauth/state-store.js";
import { createSessionStore } from "./session/session-store.js";
import { createRateLimiter } from "./middleware/rate-limit-auth.js";
import { createPkcePair, generateRandomToken } from "./security/crypto.js";
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

function createFakeGitHub(
  overrides: Partial<GitHubClient> = {},
): GitHubClient {
  return {
    exchangeCode: async () => ({ accessToken: "gho_test_token" }),
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
    ...overrides,
  };
}

const pendingOAuthStore = createPendingOAuthStore();
const sessionStore = createSessionStore({
  absoluteTtlMs: testConfig.sessionAbsoluteTtlMs,
  idleTtlMs: testConfig.sessionIdleTtlMs,
});
const rateLimiter = createRateLimiter({
  windowMs: testConfig.authRateLimitWindowMs,
  max: testConfig.authRateLimitMax,
});

function buildApp(githubClient: GitHubClient = createFakeGitHub()) {
  return createApp({
    config: testConfig,
    githubClient,
    pendingOAuthStore,
    sessionStore,
    authRateLimiter: rateLimiter,
  });
}

async function startLogin(app: ReturnType<typeof buildApp>) {
  const response = await request(app).get("/auth/login");
  const location = new URL(response.headers.location!);
  const state = location.searchParams.get("state")!;
  const cookies = asCookieHeader(response.headers["set-cookie"]);
  return { state, cookies };
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    rateLimiter.reset();
  });

  it("rejects missing state", async () => {
    const app = buildApp();
    const response = await request(app).get("/auth/callback?code=abc");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_oauth_callback" });
  });

  it("rejects mismatched state", async () => {
    const app = buildApp();
    const { cookies } = await startLogin(app);
    const response = await request(app)
      .get("/auth/callback?code=abc&state=wrong-state")
      .set("Cookie", cookies);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_oauth_callback" });
  });

  it("rejects replayed state", async () => {
    const app = buildApp();
    const { state, cookies } = await startLogin(app);

    const first = await request(app)
      .get(`/auth/callback?code=abc&state=${state}`)
      .set("Cookie", cookies);
    expect(first.status).toBe(302);

    const second = await request(app)
      .get(`/auth/callback?code=abc&state=${state}`)
      .set("Cookie", cookies);
    expect(second.status).toBe(400);
    expect(second.body).toEqual({ error: "invalid_oauth_callback" });
  });

  it("exchanges code, creates signed session, redirects to frontend", async () => {
    const exchangeCode = vi.fn(
      async (_code: string, _codeVerifier: string) => ({
        accessToken: "gho_test_token",
      }),
    );
    const app = buildApp(createFakeGitHub({ exchangeCode }));
    const { state, cookies } = await startLogin(app);

    const response = await request(app)
      .get(`/auth/callback?code=auth-code&state=${state}`)
      .set("Cookie", cookies);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("http://localhost:5173/");
    expect(exchangeCode).toHaveBeenCalledOnce();
    expect(exchangeCode).toHaveBeenCalledWith(
      "auth-code",
      expect.any(String),
    );
    const verifier = exchangeCode.mock.calls[0]?.[1];
    expect(typeof verifier).toBe("string");
    expect(String(verifier).length).toBeGreaterThan(20);

    const cookieList = asCookieHeader(response.headers["set-cookie"]);
    const sid = cookieList.find((c) => c.startsWith("sid="));
    expect(sid).toBeDefined();
    expect(sid).toMatch(/HttpOnly/i);
    expect(sid).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(response.body)).not.toMatch(/gho_test_token/);
  });

  it("handles token exchange failure safely", async () => {
    const app = buildApp(
      createFakeGitHub({
        exchangeCode: async () => {
          throw new Error("exchange failed");
        },
      }),
    );
    const { state, cookies } = await startLogin(app);
    const response = await request(app)
      .get(`/auth/callback?code=bad&state=${state}`)
      .set("Cookie", cookies);

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "oauth_exchange_failed" });
    expect(JSON.stringify(response.body)).not.toMatch(/exchange failed/);
  });

  it("rejects state length mismatches without throwing", async () => {
    const app = buildApp();
    const { codeVerifier } = createPkcePair();
    const state = generateRandomToken(32);
    pendingOAuthStore.set(state, {
      codeVerifier,
      expiresAt: Date.now() + 60_000,
    });

    const agent = request.agent(app);
    // Manually set a different-length cookie value via login then override query
    const { cookies } = await startLogin(app);
    const response = await agent
      .get("/auth/callback?code=abc&state=short")
      .set("Cookie", cookies);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_oauth_callback" });
  });
});
