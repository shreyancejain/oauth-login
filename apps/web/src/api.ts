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

export async function fetchMe(): Promise<User | null> {
  const response = await fetch("/api/me", { credentials: "include" });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Failed to load profile");
  }
  return (await response.json()) as User;
}

export async function fetchRepositories(
  page = 1,
): Promise<RepositoryPage> {
  const response = await fetch(`/api/repositories?page=${page}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to load repositories");
  }
  return (await response.json()) as RepositoryPage;
}

export async function logout(): Promise<void> {
  const response = await fetch("/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to logout");
  }
}
