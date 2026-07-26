export type PendingOAuth = {
  codeVerifier: string;
  expiresAt: number;
};

export type PendingOAuthStore = {
  set(state: string, value: PendingOAuth): void;
  get(state: string): PendingOAuth | undefined;
  consume(state: string): PendingOAuth | undefined;
  size(): number;
};

export function createPendingOAuthStore(
  now: () => number = () => Date.now(),
): PendingOAuthStore {
  const store = new Map<string, PendingOAuth>();

  function purgeExpired(): void {
    const current = now();
    for (const [key, value] of store) {
      if (value.expiresAt <= current) {
        store.delete(key);
      }
    }
  }

  return {
    set(state, value) {
      purgeExpired();
      store.set(state, value);
    },
    get(state) {
      purgeExpired();
      const value = store.get(state);
      if (!value) {
        return undefined;
      }
      if (value.expiresAt <= now()) {
        store.delete(state);
        return undefined;
      }
      return value;
    },
    consume(state) {
      const value = this.get(state);
      if (!value) {
        return undefined;
      }
      store.delete(state);
      return value;
    },
    size() {
      purgeExpired();
      return store.size;
    },
  };
}
