import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { GitHubClient } from "./oauth/github-client.js";
import { ProviderError } from "./oauth/create-github-client.js";
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

const pendingOAuthStore = createPendingOAuthStore();
const sessionStore = createSessionStore({
  absoluteTtlMs: testConfig.sessionAbsoluteTtlMs,
  idleTtlMs: testConfig.sessionIdleTtlMs,
});
const rateLimiter = createRateLimiter({
  windowMs: testConfig.authRateLimitWindowMs,
  max: testConfig.authRateLimitMax,
});

function buildApp(githubClient: GitHubClient) {
  return createApp({
    config: testConfig,
    githubClient,
    pendingOAuthStore,
    sessionStore,
    authRateLimiter: rateLimiter,
  });
}

async function loginAndGetSidCookie(
  app: ReturnType<typeof buildApp>,
  _githubClient: GitHubClient,
) {
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

describe("GET /api/repositories", () => {
  beforeEach(() => {
    rateLimiter.reset();
  });

  it("rejects unauthenticated requests", async () => {
    const app = buildApp({
      exchangeCode: async () => ({ accessToken: "t" }),
      getCurrentUser: async () => ({
        id: 1,
        login: "u",
        name: null,
        avatarUrl: "https://example.com/a.png",
      }),
      listRepositories: async () => ({
        repositories: [],
        page: 1,
        perPage: 10,
        hasNext: false,
      }),
    });
    const response = await request(app).get("/api/repositories");
    expect(response.status).toBe(401);
  });

  it("returns mapped repositories using the session token", async () => {
    const listRepositories = vi.fn(
      async (token: string, options: { page: number; perPage: number }) => {
        expect(token).toBe("gho_session_token");
        expect(options).toEqual({ page: 1, perPage: 10 });
        return {
          repositories: [
            {
              id: 10,
              name: "demo",
              description: "A demo repo",
              url: "https://github.com/octocat/demo",
              private: false,
            },
          ],
          page: 1,
          perPage: 10,
          hasNext: false,
        };
      },
    );

    const githubClient: GitHubClient = {
      exchangeCode: async () => ({ accessToken: "gho_session_token" }),
      getCurrentUser: async () => ({
        id: 1,
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/avatar.png",
      }),
      listRepositories,
    };

    const app = buildApp(githubClient);
    const sid = await loginAndGetSidCookie(app, githubClient);
    const response = await request(app)
      .get("/api/repositories")
      .set("Cookie", sid);

    expect(response.status).toBe(200);
    expect(response.headers["x-cache"]).toBe("MISS");
    expect(response.body).toEqual({
      repositories: [
        {
          id: 10,
          name: "demo",
          description: "A demo repo",
          url: "https://github.com/octocat/demo",
          private: false,
        },
      ],
      page: 1,
      perPage: 10,
      hasNext: false,
    });
    expect(listRepositories).toHaveBeenCalledOnce();
    expect(JSON.stringify(response.body)).not.toMatch(/gho_session_token/);
  });

  it("serves a cached repository page without calling GitHub again", async () => {
    const listRepositories = vi.fn(async () => ({
      repositories: [
        {
          id: 10,
          name: "demo",
          description: null,
          url: "https://github.com/octocat/demo",
          private: false,
        },
      ],
      page: 1,
      perPage: 10,
      hasNext: false,
    }));

    const githubClient: GitHubClient = {
      exchangeCode: async () => ({ accessToken: "gho_session_token" }),
      getCurrentUser: async () => ({
        id: 1,
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/avatar.png",
      }),
      listRepositories,
    };

    const app = buildApp(githubClient);
    const sid = await loginAndGetSidCookie(app, githubClient);

    const miss = await request(app).get("/api/repositories").set("Cookie", sid);
    expect(miss.headers["x-cache"]).toBe("MISS");

    const hit = await request(app).get("/api/repositories").set("Cookie", sid);
    expect(hit.status).toBe(200);
    expect(hit.headers["x-cache"]).toBe("HIT");
    expect(listRepositories).toHaveBeenCalledOnce();
  });

  it("forwards page query to the provider client", async () => {
    const listRepositories = vi.fn(
      async (_token: string, options: { page: number; perPage: number }) => ({
        repositories: [],
        page: options.page,
        perPage: options.perPage,
        hasNext: true,
      }),
    );

    const githubClient: GitHubClient = {
      exchangeCode: async () => ({ accessToken: "gho_session_token" }),
      getCurrentUser: async () => ({
        id: 1,
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/avatar.png",
      }),
      listRepositories,
    };

    const app = buildApp(githubClient);
    const sid = await loginAndGetSidCookie(app, githubClient);
    const response = await request(app)
      .get("/api/repositories?page=2")
      .set("Cookie", sid);

    expect(response.status).toBe(200);
    expect(listRepositories).toHaveBeenCalledWith("gho_session_token", {
      page: 2,
      perPage: 10,
    });
    expect(response.body).toMatchObject({ page: 2, hasNext: true });
  });

  it("rejects invalid page values", async () => {
    const githubClient: GitHubClient = {
      exchangeCode: async () => ({ accessToken: "gho_session_token" }),
      getCurrentUser: async () => ({
        id: 1,
        login: "octocat",
        name: null,
        avatarUrl: "https://example.com/avatar.png",
      }),
      listRepositories: async () => ({
        repositories: [],
        page: 1,
        perPage: 10,
        hasNext: false,
      }),
    };

    const app = buildApp(githubClient);
    const sid = await loginAndGetSidCookie(app, githubClient);
    const response = await request(app)
      .get("/api/repositories?page=0")
      .set("Cookie", sid);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "invalid_page" });
  });

  it("clears the session when the provider returns 401", async () => {
    const githubClient: GitHubClient = {
      exchangeCode: async () => ({ accessToken: "gho_session_token" }),
      getCurrentUser: async () => ({
        id: 1,
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/avatar.png",
      }),
      listRepositories: async () => {
        throw new ProviderError("Provider unauthorized", 401, "unauthorized");
      },
    };

    const app = buildApp(githubClient);
    const sid = await loginAndGetSidCookie(app, githubClient);

    const repos = await request(app).get("/api/repositories").set("Cookie", sid);
    expect(repos.status).toBe(401);
    expect(repos.body).toEqual({ error: "unauthenticated" });

    const me = await request(app).get("/api/me").set("Cookie", sid);
    expect(me.status).toBe(401);
  });

  it("returns a safe error for provider failures", async () => {
    const githubClient: GitHubClient = {
      exchangeCode: async () => ({ accessToken: "gho_session_token" }),
      getCurrentUser: async () => ({
        id: 1,
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/avatar.png",
      }),
      listRepositories: async () => {
        throw new ProviderError("boom", 502, "upstream_error");
      },
    };

    const app = buildApp(githubClient);
    const sid = await loginAndGetSidCookie(app, githubClient);
    const response = await request(app)
      .get("/api/repositories")
      .set("Cookie", sid);

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "upstream_error" });
    expect(JSON.stringify(response.body)).not.toMatch(/boom/);
  });
});
