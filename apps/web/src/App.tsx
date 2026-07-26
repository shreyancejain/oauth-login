import { useEffect, useState } from "react";
import {
  fetchMe,
  fetchRepositories,
  logout as apiLogout,
  type Repository,
  type User,
} from "./api";

type Status = "loading" | "unauthenticated" | "authenticated" | "error";

function GitHubIcon() {
  return (
    <svg className="gh-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [reposLoading, setReposLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const me = await fetchMe();
        if (cancelled) {
          return;
        }
        if (!me) {
          setStatus("unauthenticated");
          return;
        }
        setUser(me);
        const result = await fetchRepositories(1);
        if (cancelled) {
          return;
        }
        setRepositories(result.repositories);
        setPage(result.page);
        setHasNext(result.hasNext);
        setStatus("authenticated");
      } catch {
        if (!cancelled) {
          setErrorMessage("Something went wrong. Please try again.");
          setStatus("error");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadPage(nextPage: number) {
    setReposLoading(true);
    try {
      const result = await fetchRepositories(nextPage);
      setRepositories(result.repositories);
      setPage(result.page);
      setHasNext(result.hasNext);
    } catch {
      setErrorMessage("Failed to load repositories.");
      setStatus("error");
    } finally {
      setReposLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await apiLogout();
      setUser(null);
      setRepositories([]);
      setPage(1);
      setHasNext(false);
      setStatus("unauthenticated");
    } catch {
      setErrorMessage("Logout failed. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="app-shell">
      {status === "loading" && (
        <section className="hero" aria-busy="true">
          <h1 className="title">OAuth login</h1>
          <p className="status-line">Loading…</p>
        </section>
      )}

      {status === "error" && (
        <section className="hero">
          <h1 className="title">Something went wrong</h1>
          <div className="panel" style={{ marginTop: "1.25rem" }}>
            <p className="alert" role="alert">
              {errorMessage ?? "Unexpected error"}
            </p>
            <div className="cta-row">
              <a className="button button-primary" href="/">
                Try again
              </a>
            </div>
          </div>
        </section>
      )}

      {status === "unauthenticated" && (
        <section className="hero">
          <h1 className="title">OAuth login</h1>
          <p className="lede">Sign in to view your GitHub repositories.</p>
          <div className="cta-row">
            <a className="button button-primary" href="/auth/login">
              <GitHubIcon />
              Login with GitHub
            </a>
          </div>
        </section>
      )}

      {status === "authenticated" && user && (
        <>
          <header className="topbar">
            <h1 className="title">OAuth login</h1>
            <div className="user-chip">
              <img
                className="avatar"
                src={user.avatarUrl}
                alt=""
                width={32}
                height={32}
              />
              <div className="user-meta">
                <strong>Signed in as {user.login}</strong>
                <span>{user.name ?? "GitHub account"}</span>
              </div>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => void handleLogout()}
              >
                Logout
              </button>
            </div>
          </header>

          <section className="panel">
            <div className="section-head">
              <h2>Repositories</h2>
              <p>
                {repositories.length === 0
                  ? "None yet"
                  : `Page ${page}`}
              </p>
            </div>

            {reposLoading ? (
              <p className="empty">Loading…</p>
            ) : repositories.length === 0 ? (
              <p className="empty">No public repositories found.</p>
            ) : (
              <ul className="repo-list">
                {repositories.map((repo) => (
                  <li key={repo.id} className="repo-item">
                    <a href={repo.url} target="_blank" rel="noreferrer">
                      {repo.name}
                    </a>
                    {repo.description ? <p>{repo.description}</p> : null}
                  </li>
                ))}
              </ul>
            )}

            {(page > 1 || hasNext) && (
              <div className="pagination">
                <button
                  type="button"
                  className="button button-ghost"
                  disabled={page <= 1 || reposLoading}
                  onClick={() => void loadPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  disabled={!hasNext || reposLoading}
                  onClick={() => void loadPage(page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
