import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { GitHubClient } from "./oauth/github-client.js";
import { createPendingOAuthStore } from "./oauth/state-store.js";
import { createSessionStore } from "./session/session-store.js";

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
    name: null,
    avatarUrl: "https://example.com/a.png",
  }),
  listRepositories: async () => ({
    repositories: [],
    page: 1,
    perPage: 10,
    hasNext: false,
  }),
};

function buildApp() {
  return createApp({
    config: testConfig,
    githubClient: fakeGitHub,
    pendingOAuthStore: createPendingOAuthStore(),
    sessionStore: createSessionStore({
      absoluteTtlMs: testConfig.sessionAbsoluteTtlMs,
      idleTtlMs: testConfig.sessionIdleTtlMs,
    }),
  });
}

describe("security", () => {
  it("does not reflect arbitrary CORS origins", async () => {
    const app = buildApp();
    const response = await request(app)
      .get("/health")
      .set("Origin", "https://evil.example");

    expect(response.headers["access-control-allow-origin"]).not.toBe(
      "https://evil.example",
    );
  });

  it("allows the configured frontend origin", async () => {
    const app = buildApp();
    const response = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5173");

    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("sets security headers", async () => {
    const app = buildApp();
    const response = await request(app).get("/health");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["content-security-policy"]).toBeTruthy();
  });
});
