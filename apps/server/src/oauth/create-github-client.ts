import type { AppConfig } from "../config.js";
import type {
  GitHubClient,
  Repository,
  RepositoryPage,
  User,
} from "./github-client.js";
import { linkHeaderHasNext } from "./pagination.js";

type GitHubTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GitHubUserResponse = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
};

type GitHubRepoResponse = {
  id: number;
  name: string;
  description: string | null;
  html_url: string;
  private: boolean;
};

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code:
      | "token_exchange_failed"
      | "unauthorized"
      | "forbidden"
      | "rate_limited"
      | "upstream_error"
      | "network_error"
      | "malformed_response",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function createGitHubClient(config: AppConfig): GitHubClient {
  async function parseJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      throw new ProviderError(
        "Malformed provider response",
        502,
        "malformed_response",
      );
    }
  }

  function mapStatus(status: number): ProviderError {
    if (status === 401) {
      return new ProviderError("Provider unauthorized", 401, "unauthorized");
    }
    if (status === 403) {
      return new ProviderError("Provider forbidden", 403, "forbidden");
    }
    if (status === 429) {
      return new ProviderError("Provider rate limited", 429, "rate_limited");
    }
    return new ProviderError("Provider error", 502, "upstream_error");
  }

  return {
    async exchangeCode(code, codeVerifier) {
      let response: Response;
      try {
        response = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: config.oauthClientId,
            client_secret: config.oauthClientSecret,
            code,
            redirect_uri: config.oauthRedirectUri,
            code_verifier: codeVerifier,
          }),
        });
      } catch {
        throw new ProviderError("Network failure", 503, "network_error");
      }

      const body = await parseJson<GitHubTokenResponse>(response);
      if (!response.ok || !body.access_token) {
        throw new ProviderError(
          "Token exchange failed",
          502,
          "token_exchange_failed",
        );
      }

      return { accessToken: body.access_token };
    },

    async getCurrentUser(accessToken) {
      let response: Response;
      try {
        response = await fetch("https://api.github.com/user", {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${accessToken}`,
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "oauth-login",
          },
        });
      } catch {
        throw new ProviderError("Network failure", 503, "network_error");
      }

      if (!response.ok) {
        throw mapStatus(response.status);
      }

      const body = await parseJson<GitHubUserResponse>(response);
      if (
        typeof body.id !== "number" ||
        typeof body.login !== "string" ||
        typeof body.avatar_url !== "string"
      ) {
        throw new ProviderError(
          "Malformed provider response",
          502,
          "malformed_response",
        );
      }

      const user: User = {
        id: body.id,
        login: body.login,
        name: body.name ?? null,
        avatarUrl: body.avatar_url,
      };
      return user;
    },

    async listRepositories(accessToken, options): Promise<RepositoryPage> {
      const url = new URL("https://api.github.com/user/repos");
      url.searchParams.set("visibility", "public");
      url.searchParams.set("sort", "updated");
      url.searchParams.set("per_page", String(options.perPage));
      url.searchParams.set("page", String(options.page));

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${accessToken}`,
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "oauth-login",
          },
        });
      } catch {
        throw new ProviderError("Network failure", 503, "network_error");
      }

      if (!response.ok) {
        throw mapStatus(response.status);
      }

      const body = await parseJson<GitHubRepoResponse[]>(response);
      if (!Array.isArray(body)) {
        throw new ProviderError(
          "Malformed provider response",
          502,
          "malformed_response",
        );
      }

      const repositories = body.map((repo): Repository => {
        if (
          typeof repo.id !== "number" ||
          typeof repo.name !== "string" ||
          typeof repo.html_url !== "string" ||
          typeof repo.private !== "boolean"
        ) {
          throw new ProviderError(
            "Malformed provider response",
            502,
            "malformed_response",
          );
        }
        return {
          id: repo.id,
          name: repo.name,
          description: repo.description ?? null,
          url: repo.html_url,
          private: repo.private,
        };
      });

      return {
        repositories,
        page: options.page,
        perPage: options.perPage,
        hasNext: linkHeaderHasNext(response.headers.get("link")),
      };
    },
  };
}
