import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config.js";
import type { SessionRecord, SessionStore } from "../session/session-store.js";

export type AuthedRequest = Request & {
  sessionId: string;
  session: SessionRecord;
};

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
      res.clearCookie("sid", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: options.cookieSecure,
        signed: true,
      });
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
    const allowed = new Set([
      options.config.frontendUrl,
      `http://localhost:${options.config.port}`,
      `http://127.0.0.1:${options.config.port}`,
    ]);

    const origin = req.get("origin");
    if (origin && allowed.has(origin)) {
      next();
      return;
    }

    const referer = req.get("referer");
    if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        if (allowed.has(refererOrigin)) {
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
