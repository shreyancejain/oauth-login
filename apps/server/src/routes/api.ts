import { Router, type RequestHandler } from "express";
import type { AppConfig } from "../config.js";
import type { GitHubClient, RepositoryPage } from "../oauth/github-client.js";
import { ProviderError } from "../oauth/create-github-client.js";
import {
  createRequireSameOrigin,
  createRequireSession,
  type AuthedRequest,
} from "../middleware/auth.js";
import type { SessionStore } from "../session/session-store.js";
import {
  DEFAULT_REPOS_PER_PAGE,
  parsePageQuery,
} from "../oauth/pagination.js";
import type { LruCache } from "../cache/lru-cache.js";

export function repositoryCacheKey(sessionId: string, page: number): string {
  return `repos:${sessionId}:page:${page}`;
}

export function createApiRouter(options: {
  config: AppConfig;
  sessionStore: SessionStore;
  githubClient: GitHubClient;
  repositoryCache: LruCache<string, RepositoryPage>;
}): Router {
  const router = Router();
  const requireSession = createRequireSession({
    sessionStore: options.sessionStore,
    cookieSecure: options.config.cookieSecure,
  });

  router.get("/me", requireSession, (req, res) => {
    const { session } = req as AuthedRequest;
    res.status(200).json(session.user);
  });

  router.get("/repositories", requireSession, async (req, res) => {
    const { session, sessionId } = req as AuthedRequest;
    const page = parsePageQuery(req.query.page);
    if (page === null) {
      res.status(400).json({ error: "invalid_page" });
      return;
    }

    const cacheKey = repositoryCacheKey(sessionId, page);
    const cached = options.repositoryCache.get(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      res.status(200).json(cached);
      return;
    }

    try {
      const result = await options.githubClient.listRepositories(
        session.accessToken,
        { page, perPage: DEFAULT_REPOS_PER_PAGE },
      );
      options.repositoryCache.set(cacheKey, result);
      res.setHeader("X-Cache", "MISS");
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ProviderError && error.code === "unauthorized") {
        options.sessionStore.destroy(sessionId);
        options.repositoryCache.deleteByPrefix(`repos:${sessionId}:`);
        res.clearCookie("sid", {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: options.config.cookieSecure,
          signed: true,
        });
        res.status(401).json({ error: "unauthenticated" });
        return;
      }

      if (error instanceof ProviderError) {
        const status =
          error.code === "rate_limited"
            ? 429
            : error.code === "forbidden"
              ? 403
              : error.code === "network_error"
                ? 503
                : 502;
        res.status(status).json({ error: error.code });
        return;
      }

      res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}

export function attachLogoutRoute(options: {
  config: AppConfig;
  sessionStore: SessionStore;
  repositoryCache: LruCache<string, RepositoryPage>;
  router: Router;
}): void {
  const requireSession = createRequireSession({
    sessionStore: options.sessionStore,
    cookieSecure: options.config.cookieSecure,
  });
  const requireSameOrigin = createRequireSameOrigin({
    config: options.config,
  });

  options.router.post(
    "/logout",
    requireSameOrigin,
    requireSession,
    ((req, res) => {
      const { sessionId } = req as AuthedRequest;
      options.sessionStore.destroy(sessionId);
      options.repositoryCache.deleteByPrefix(`repos:${sessionId}:`);
      res.clearCookie("sid", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: options.config.cookieSecure,
        signed: true,
      });
      res.status(204).send();
    }) as RequestHandler,
  );
}
