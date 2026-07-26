import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("shows login when unauthenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    render(<App />);
    expect(await screen.findByText("Login with GitHub")).toBeTruthy();
  });

  it("shows repositories when authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/me")) {
          return Response.json({
            id: 1,
            login: "octocat",
            name: "The Octocat",
            avatarUrl: "https://example.com/a.png",
          });
        }
        if (url.includes("/api/repositories")) {
          return Response.json({
            repositories: [
              {
                id: 10,
                name: "hello-world",
                description: "demo",
                url: "https://github.com/octocat/hello-world",
                private: false,
              },
            ],
            page: 1,
            perPage: 10,
            hasNext: false,
          });
        }
        return new Response(null, { status: 404 });
      }),
    );

    render(<App />);
    expect(await screen.findByText(/Signed in as/)).toBeTruthy();
    expect(await screen.findByText("hello-world")).toBeTruthy();
  });

  it("shows an error state when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );

    render(<App />);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("returns to login after logout", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/me")) {
        return Response.json({
          id: 1,
          login: "octocat",
          name: null,
          avatarUrl: "https://example.com/a.png",
        });
      }
      if (url.includes("/api/repositories")) {
        return Response.json({
          repositories: [],
          page: 1,
          perPage: 10,
          hasNext: false,
        });
      }
      if (url.includes("/auth/logout") && init?.method === "POST") {
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    expect(await screen.findByText(/Signed in as/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Logout" }));
    await waitFor(() => {
      expect(screen.getByText("Login with GitHub")).toBeTruthy();
    });
  });

  it("paginates repositories with Next", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/me")) {
        return Response.json({
          id: 1,
          login: "octocat",
          name: null,
          avatarUrl: "https://example.com/a.png",
        });
      }
      if (url.includes("/api/repositories?page=1")) {
        return Response.json({
          repositories: [
            {
              id: 1,
              name: "repo-one",
              description: null,
              url: "https://github.com/octocat/repo-one",
              private: false,
            },
          ],
          page: 1,
          perPage: 10,
          hasNext: true,
        });
      }
      if (url.includes("/api/repositories?page=2")) {
        return Response.json({
          repositories: [
            {
              id: 2,
              name: "repo-two",
              description: null,
              url: "https://github.com/octocat/repo-two",
              private: false,
            },
          ],
          page: 2,
          perPage: 10,
          hasNext: false,
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    expect(await screen.findByText("repo-one")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("repo-two")).toBeTruthy();
    expect(screen.getByText("Page 2")).toBeTruthy();
  });
});
