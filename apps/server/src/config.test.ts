import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const validEnv = {
  PORT: "3000",
  NODE_ENV: "test",
  FRONTEND_URL: "http://localhost:5173",
  OAUTH_REDIRECT_URI: "http://localhost:3000/auth/callback",
  OAUTH_CLIENT_ID: "client-id",
  OAUTH_CLIENT_SECRET: "client-secret",
  SESSION_SECRET: "a".repeat(32),
  COOKIE_SECURE: "false",
};

describe("loadConfig", () => {
  it("loads a valid configuration", () => {
    const config = loadConfig(validEnv);
    expect(config.port).toBe(3000);
    expect(config.frontendUrl).toBe("http://localhost:5173");
    expect(config.oauthClientId).toBe("client-id");
    expect(config.cookieSecure).toBe(false);
  });

  it("rejects a missing SESSION_SECRET", () => {
    const { SESSION_SECRET: _, ...env } = validEnv;
    expect(() => loadConfig(env)).toThrow(/SESSION_SECRET/);
  });

  it("rejects a short SESSION_SECRET", () => {
    expect(() =>
      loadConfig({ ...validEnv, SESSION_SECRET: "too-short" }),
    ).toThrow(/SESSION_SECRET/);
  });

  it("rejects missing OAuth credentials", () => {
    const { OAUTH_CLIENT_ID: _, ...env } = validEnv;
    expect(() => loadConfig(env)).toThrow(/OAUTH_CLIENT_ID/);
  });

  it("rejects FRONTEND_URL with a trailing slash", () => {
    expect(() =>
      loadConfig({ ...validEnv, FRONTEND_URL: "http://localhost:5173/" }),
    ).toThrow(/FRONTEND_URL/);
  });
});
