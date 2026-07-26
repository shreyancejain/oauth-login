import { Router, type Request, type Response, type RequestHandler } from "express";
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
import { clearCookie } from "../utils/cookies.js";

export function repositoryCacheKey(sessionId: string, page: number): string {
  return `repos:${sessionId}:page:${page}`;
}

type ApiRouterOptions = {
  config: AppConfig;
  sessionStore: SessionStore;
  githubClient: GitHubClient;
  repositoryCache: LruCache<string, RepositoryPage>;
};

function providerErrorHttpStatus(code: ProviderError["code"]): number {
  if (code === "rate_limited") {
    return 429;
  }
  if (code === "forbidden") {
    return 403;
  }
  if (code === "network_error") {
    return 503;
  }
  return 502;
}

function handleMe(req: Request, res: Response): void {
  const { session } = req as AuthedRequest;
  res.status(200).json(session.user);
}

async function handleRepositories(
  options: ApiRouterOptions,
  req: Request,
  res: Response,
): Promise<void> {
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
      clearCookie(res, "sid", { secure: options.config.cookieSecure });
      res.status(401).json({ error: "unauthenticated" });
      return;
    }

    if (error instanceof ProviderError) {
      res
        .status(providerErrorHttpStatus(error.code))
        .json({ error: error.code });
      return;
    }

    res.status(500).json({ error: "internal_error" });
  }
}

function handleLogout(options: {
  config: AppConfig;
  sessionStore: SessionStore;
  repositoryCache: LruCache<string, RepositoryPage>;
}): RequestHandler {
  return (req, res) => {
    const { sessionId } = req as AuthedRequest;
    options.sessionStore.destroy(sessionId);
    options.repositoryCache.deleteByPrefix(`repos:${sessionId}:`);
    clearCookie(res, "sid", { secure: options.config.cookieSecure });
    res.status(204).send();
  };
}

export function createApiRouter(options: ApiRouterOptions): Router {
  const router = Router();
  const requireSession = createRequireSession({
    sessionStore: options.sessionStore,
    cookieSecure: options.config.cookieSecure,
  });

  router.get("/me", requireSession, handleMe);
  router.get("/repositories", requireSession, (req, res) => {
    void handleRepositories(options, req, res);
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
    handleLogout(options),
  );
}
