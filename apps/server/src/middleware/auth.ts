import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config.js";
import type { SessionRecord, SessionStore } from "../session/session-store.js";
import { clearCookie } from "../utils/cookies.js";

export type AuthedRequest = Request & {
  sessionId: string;
  session: SessionRecord;
};

function isAllowedOrigin(origin: string, config: AppConfig): boolean {
  const allowed = new Set([
    config.frontendUrl,
    `http://localhost:${config.port}`,
    `http://127.0.0.1:${config.port}`,
  ]);
  return allowed.has(origin);
}

export function createRequireSession(options: {
  sessionStore: SessionStore;
  cookieSecure: boolean;
}): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const sessionId =
      typeof req.signedCookies.sid === "string" ? req.signedCookies.sid : null;

    if (!sessionId) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }

    const session = options.sessionStore.touch(sessionId);
    if (!session) {
      clearCookie(res, "sid", { secure: options.cookieSecure });
      res.status(401).json({ error: "unauthenticated" });
      return;
    }

    (req as AuthedRequest).sessionId = sessionId;
    (req as AuthedRequest).session = session;
    next();
  };
}

export function createRequireSameOrigin(options: {
  config: AppConfig;
}): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const origin = req.get("origin");
    if (origin && isAllowedOrigin(origin, options.config)) {
      next();
      return;
    }

    const referer = req.get("referer");
    if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        if (isAllowedOrigin(refererOrigin, options.config)) {
          next();
          return;
        }
      } catch {
        // fall through
      }
    }

    res.status(403).json({ error: "forbidden" });
  };
}
