import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express, type RequestHandler } from "express";
import helmet from "helmet";
import type { AppConfig } from "./config.js";
import { createLruCache, type LruCache } from "./cache/lru-cache.js";
import { createRateLimiter, type RateLimiter } from "./middleware/rate-limit-auth.js";
import type { GitHubClient, RepositoryPage } from "./oauth/github-client.js";
import type { PendingOAuthStore } from "./oauth/state-store.js";
import { createAuthRouter } from "./routes/auth.js";
import { createApiRouter } from "./routes/api.js";
import type { SessionStore } from "./session/session-store.js";

export const REPOSITORY_CACHE_CAPACITY = 5;

export type AppDependencies = {
  config: AppConfig;
  githubClient: GitHubClient;
  pendingOAuthStore: PendingOAuthStore;
  sessionStore: SessionStore;
  authRateLimiter?: RateLimiter;
  repositoryCache?: LruCache<string, RepositoryPage>;
};

export function createApp(deps: AppDependencies): Express {
  const app = express();
  const authRateLimiter =
    deps.authRateLimiter ??
    createRateLimiter({
      windowMs: deps.config.authRateLimitWindowMs,
      max: deps.config.authRateLimitMax,
    });
  const repositoryCache =
    deps.repositoryCache ??
    createLruCache<string, RepositoryPage>(REPOSITORY_CACHE_CAPACITY);

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  app.use(
    cors({
      origin: deps.config.frontendUrl,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser(deps.config.sessionSecret));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  const rateLimit: RequestHandler = (req, res, next) =>
    authRateLimiter.middleware(req, res, next);

  app.use(
    "/auth",
    createAuthRouter({
      config: deps.config,
      pendingOAuthStore: deps.pendingOAuthStore,
      sessionStore: deps.sessionStore,
      githubClient: deps.githubClient,
      rateLimit,
      repositoryCache,
    }),
  );

  app.use(
    "/api",
    createApiRouter({
      config: deps.config,
      sessionStore: deps.sessionStore,
      githubClient: deps.githubClient,
      repositoryCache,
    }),
  );

  return app;
}
