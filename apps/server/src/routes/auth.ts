import { Router, type RequestHandler } from "express";
import type { AppConfig } from "../config.js";
import type { GitHubClient } from "../oauth/github-client.js";
import type { PendingOAuthStore } from "../oauth/state-store.js";
import {
  createPkcePair,
  generateRandomToken,
  timingSafeEqualString,
} from "../security/crypto.js";
import type { SessionStore } from "../session/session-store.js";
import { attachLogoutRoute } from "./api.js";
import type { LruCache } from "../cache/lru-cache.js";
import type { RepositoryPage } from "../oauth/github-client.js";

export function createAuthRouter(options: {
  config: AppConfig;
  pendingOAuthStore: PendingOAuthStore;
  sessionStore: SessionStore;
  githubClient: GitHubClient;
  rateLimit: RequestHandler;
  repositoryCache: LruCache<string, RepositoryPage>;
}): Router {
  const router = Router();

  router.get("/login", options.rateLimit, (_req, res) => {
    const state = generateRandomToken(32);
    const { codeVerifier, codeChallenge } = createPkcePair();

    options.pendingOAuthStore.set(state, {
      codeVerifier,
      expiresAt: Date.now() + options.config.oauthStateTtlMs,
    });

    res.cookie("oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: options.config.cookieSecure,
      signed: true,
      path: "/auth",
      maxAge: options.config.oauthStateTtlMs,
    });

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", options.config.oauthClientId);
    authorizeUrl.searchParams.set(
      "redirect_uri",
      options.config.oauthRedirectUri,
    );
    authorizeUrl.searchParams.set("scope", "read:user");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    res.redirect(302, authorizeUrl.toString());
  });

  router.get("/callback", options.rateLimit, async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const cookieState =
      typeof req.signedCookies.oauth_state === "string"
        ? req.signedCookies.oauth_state
        : null;

    const clearOAuthCookie = () => {
      res.clearCookie("oauth_state", {
        path: "/auth",
        httpOnly: true,
        sameSite: "lax",
        secure: options.config.cookieSecure,
        signed: true,
      });
    };

    if (!code || !state || !cookieState) {
      clearOAuthCookie();
      res.status(400).json({ error: "invalid_oauth_callback" });
      return;
    }

    if (!timingSafeEqualString(state, cookieState)) {
      clearOAuthCookie();
      res.status(400).json({ error: "invalid_oauth_callback" });
      return;
    }

    const pending = options.pendingOAuthStore.consume(state);
    if (!pending) {
      clearOAuthCookie();
      res.status(400).json({ error: "invalid_oauth_callback" });
      return;
    }

    try {
      const { accessToken } = await options.githubClient.exchangeCode(
        code,
        pending.codeVerifier,
      );
      const user = await options.githubClient.getCurrentUser(accessToken);
      const sessionId = options.sessionStore.create({ accessToken, user });

      clearOAuthCookie();
      res.cookie("sid", sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: options.config.cookieSecure,
        signed: true,
        path: "/",
        maxAge: options.config.sessionAbsoluteTtlMs,
      });

      res.redirect(302, `${options.config.frontendUrl}/`);
    } catch {
      clearOAuthCookie();
      res.status(502).json({ error: "oauth_exchange_failed" });
    }
  });

  attachLogoutRoute({
    config: options.config,
    sessionStore: options.sessionStore,
    repositoryCache: options.repositoryCache,
    router,
  });

  return router;
}
