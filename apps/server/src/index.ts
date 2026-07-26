import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createGitHubClient } from "./oauth/create-github-client.js";
import { createPendingOAuthStore } from "./oauth/state-store.js";
import { createSessionStore } from "./session/session-store.js";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
dotenv.config({ path: path.join(rootDir, ".env") });

const config = loadConfig();

const app = createApp({
  config,
  githubClient: createGitHubClient(config),
  pendingOAuthStore: createPendingOAuthStore(),
  sessionStore: createSessionStore({
    absoluteTtlMs: config.sessionAbsoluteTtlMs,
    idleTtlMs: config.sessionIdleTtlMs,
  }),
});

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
