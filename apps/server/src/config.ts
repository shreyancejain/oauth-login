export type AppConfig = {
  port: number;
  nodeEnv: string;
  frontendUrl: string;
  oauthRedirectUri: string;
  oauthClientId: string;
  oauthClientSecret: string;
  sessionSecret: string;
  cookieSecure: boolean;
  sessionAbsoluteTtlMs: number;
  sessionIdleTtlMs: number;
  oauthStateTtlMs: number;
  authRateLimitWindowMs: number;
  authRateLimitMax: number;
};

const MIN_SESSION_SECRET_LENGTH = 32;

function requireEnv(
  env: NodeJS.Dict<string>,
  key: string,
): string {
  const value = env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

export function loadConfig(
  env: NodeJS.Dict<string> = process.env,
): AppConfig {
  const sessionSecret = requireEnv(env, "SESSION_SECRET");
  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters`,
    );
  }

  const frontendUrl = requireEnv(env, "FRONTEND_URL");
  if (frontendUrl.endsWith("/")) {
    throw new Error("FRONTEND_URL must not have a trailing slash");
  }

  const oauthRedirectUri = requireEnv(env, "OAUTH_REDIRECT_URI");
  if (oauthRedirectUri.endsWith("/")) {
    throw new Error("OAUTH_REDIRECT_URI must not have a trailing slash");
  }

  const portRaw = env.PORT ?? "3000";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${portRaw}`);
  }

  return {
    port,
    nodeEnv: env.NODE_ENV ?? "development",
    frontendUrl,
    oauthRedirectUri,
    oauthClientId: requireEnv(env, "OAUTH_CLIENT_ID"),
    oauthClientSecret: requireEnv(env, "OAUTH_CLIENT_SECRET"),
    sessionSecret,
    cookieSecure: parseBoolean(env.COOKIE_SECURE, false),
    sessionAbsoluteTtlMs: 8 * 60 * 60 * 1000,
    sessionIdleTtlMs: 30 * 60 * 1000,
    oauthStateTtlMs: 10 * 60 * 1000,
    authRateLimitWindowMs: 60 * 1000,
    authRateLimitMax: 20,
  };
}
