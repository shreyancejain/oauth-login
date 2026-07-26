export type User = {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
};

export type Repository = {
  id: number;
  name: string;
  description: string | null;
  url: string;
  private: boolean;
};

export type RepositoryPage = {
  repositories: Repository[];
  page: number;
  perPage: number;
  hasNext: boolean;
};

export type ListRepositoriesOptions = {
  page: number;
  perPage: number;
};

export type GitHubClient = {
  exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<{ accessToken: string }>;
  getCurrentUser(accessToken: string): Promise<User>;
  listRepositories(
    accessToken: string,
    options: ListRepositoriesOptions,
  ): Promise<RepositoryPage>;
};
