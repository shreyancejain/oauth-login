import { randomBytes } from "node:crypto";
import type { User } from "../oauth/github-client.js";

export type SessionRecord = {
  accessToken: string;
  user: User;
  createdAt: number;
  lastSeenAt: number;
};

export type SessionStore = {
  create(record: Omit<SessionRecord, "createdAt" | "lastSeenAt">): string;
  get(sessionId: string): SessionRecord | undefined;
  touch(sessionId: string): SessionRecord | undefined;
  destroy(sessionId: string): void;
};

export type SessionStoreOptions = {
  absoluteTtlMs: number;
  idleTtlMs: number;
  now?: () => number;
  createId?: () => string;
};

function isExpired(
  record: SessionRecord,
  current: number,
  absoluteTtlMs: number,
  idleTtlMs: number,
): boolean {
  if (record.createdAt + absoluteTtlMs <= current) {
    return true;
  }
  if (record.lastSeenAt + idleTtlMs <= current) {
    return true;
  }
  return false;
}

export function createSessionStore(options: SessionStoreOptions): SessionStore {
  const store = new Map<string, SessionRecord>();
  const now = options.now ?? (() => Date.now());
  const createId =
    options.createId ?? (() => randomBytes(32).toString("base64url"));

  return {
    create(record) {
      const current = now();
      const sessionId = createId();
      store.set(sessionId, {
        ...record,
        createdAt: current,
        lastSeenAt: current,
      });
      return sessionId;
    },
    get(sessionId) {
      const record = store.get(sessionId);
      if (!record) {
        return undefined;
      }
      if (
        isExpired(
          record,
          now(),
          options.absoluteTtlMs,
          options.idleTtlMs,
        )
      ) {
        store.delete(sessionId);
        return undefined;
      }
      return record;
    },
    touch(sessionId) {
      const record = this.get(sessionId);
      if (!record) {
        return undefined;
      }
      const updated = { ...record, lastSeenAt: now() };
      store.set(sessionId, updated);
      return updated;
    },
    destroy(sessionId) {
      store.delete(sessionId);
    },
  };
}
