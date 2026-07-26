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

function buildTestApp() {
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

describe("GET /health", () => {
  it("returns 200", async () => {
    const app = buildTestApp();
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
