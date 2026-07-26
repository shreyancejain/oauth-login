import { Router, type Request, type Response, type RequestHandler } from "express";
import type { AppConfig } from "../config.js";
import type { GitHubClient, RepositoryPage } from "../oauth/github-client.js";
import type { PendingOAuthStore } from "../oauth/state-store.js";
import {
  createPkcePair,
  generateRandomToken,
  timingSafeEqualString,
} from "../security/crypto.js";
import type { SessionStore } from "../session/session-store.js";
import { attachLogoutRoute } from "./api.js";
import type { LruCache } from "../cache/lru-cache.js";
import { clearCookie, setCookie } from "../utils/cookies.js";

type AuthRouterOptions = {
  config: AppConfig;
  pendingOAuthStore: PendingOAuthStore;
  sessionStore: SessionStore;
  githubClient: GitHubClient;
  rateLimit: RequestHandler;
  repositoryCache: LruCache<string, RepositoryPage>;
};

function buildAuthorizeUrl(
  config: AppConfig,
  state: string,
  codeChallenge: string,
): string {
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", config.oauthClientId);
  authorizeUrl.searchParams.set("redirect_uri", config.oauthRedirectUri);
  authorizeUrl.searchParams.set("scope", "read:user");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  return authorizeUrl.toString();
}

function handleLogin(options: AuthRouterOptions) {
  return (_req: Request, res: Response) => {
    const state = generateRandomToken(32);
    const { codeVerifier, codeChallenge } = createPkcePair();

    options.pendingOAuthStore.set(state, {
      codeVerifier,
      expiresAt: Date.now() + options.config.oauthStateTtlMs,
    });

    setCookie(res, "oauth_state", state, {
      secure: options.config.cookieSecure,
      path: "/auth",
      maxAge: options.config.oauthStateTtlMs,
    });

    res.redirect(
      302,
      buildAuthorizeUrl(options.config, state, codeChallenge),
    );
  };
}

function handleCallback(options: AuthRouterOptions) {
  return async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const cookieState =
      typeof req.signedCookies.oauth_state === "string"
        ? req.signedCookies.oauth_state
        : null;

    const clearOAuthState = () =>
      clearCookie(res, "oauth_state", {
        secure: options.config.cookieSecure,
        path: "/auth",
      });

    if (!code || !state || !cookieState) {
      clearOAuthState();
      res.status(400).json({ error: "invalid_oauth_callback" });
      return;
    }

    if (!timingSafeEqualString(state, cookieState)) {
      clearOAuthState();
      res.status(400).json({ error: "invalid_oauth_callback" });
      return;
    }

    const pending = options.pendingOAuthStore.consume(state);
    if (!pending) {
      clearOAuthState();
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

      clearOAuthState();
      setCookie(res, "sid", sessionId, {
        secure: options.config.cookieSecure,
        maxAge: options.config.sessionAbsoluteTtlMs,
      });

      res.redirect(302, `${options.config.frontendUrl}/`);
    } catch {
      clearOAuthState();
      res.status(502).json({ error: "oauth_exchange_failed" });
    }
  };
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();

  router.get("/login", options.rateLimit, handleLogin(options));
  router.get("/callback", options.rateLimit, handleCallback(options));

  attachLogoutRoute({
    config: options.config,
    sessionStore: options.sessionStore,
    repositoryCache: options.repositoryCache,
    router,
  });

  return router;
}
