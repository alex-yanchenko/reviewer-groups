import { afterEach, describe, expect, it } from "vitest";
import { handleExtensionMessage } from "./requestHandler";
import { createFakeGitHub, mountPullRequestPage } from "./testing/fakeGitHub";

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
});

describe("handleExtensionMessage", () => {
  it("requests review from the members in a request-review message", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([{ id: 101, login: "mona" }]);

    expect(
      await handleExtensionMessage(
        { doc: document, fetch: github.fetch },
        { type: "request-review", members: ["mona"] },
      ),
    ).toEqual({
      ok: true,
      outcome: {
        added: ["mona"],
        alreadyRequested: [],
        unavailable: [],
        notFound: [],
        unconfirmed: [],
        gone: [],
      },
    });
  });

  it("answers with the reason when the tab cannot take a request", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub([{ id: 101, login: "mona" }]);

    expect(
      await handleExtensionMessage(
        { doc: document, fetch: github.fetch },
        { type: "request-review", members: ["mona"] },
      ),
    ).toEqual({ ok: false, error: "Open the pull request's Conversation tab to request reviews." });
  });

  it("answers with GitHub's refusal of a request", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([{ id: 101, login: "mona" }], { postStatus: 422 });

    expect(
      await handleExtensionMessage(
        { doc: document, fetch: github.fetch },
        { type: "request-review", members: ["mona"] },
      ),
    ).toEqual({ ok: false, error: "GitHub answered 422." });
  });

  it("refuses a request-review message whose members are not GitHub logins", async () => {
    const github = createFakeGitHub([]);

    expect(
      await handleExtensionMessage(
        { doc: document, fetch: github.fetch },
        { type: "request-review", members: ["not a login"] },
      ),
    ).toEqual({ ok: false, error: "The request did not carry a valid member list." });
    expect(github.fetch).not.toHaveBeenCalled();
  });

  it("searches GitHub's reviewer list for a list-reviewers message", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([{ id: 101, login: "mona", name: "Mona" }]);

    expect(
      await handleExtensionMessage(
        { doc: document, fetch: github.fetch },
        { type: "list-reviewers", query: "mo" },
      ),
    ).toEqual({
      ok: true,
      candidates: [
        {
          login: "mona",
          description: "Mona",
          avatarUrl: "https://avatars.githubusercontent.com/u/101",
          team: false,
          requested: false,
          available: true,
          reviewState: null,
        },
      ],
    });
  });

  it("answers a list-reviewers message with the reason when the tab is not a pull request", async () => {
    const github = createFakeGitHub([]);

    expect(
      await handleExtensionMessage(
        { doc: document, fetch: github.fetch },
        { type: "list-reviewers", query: "" },
      ),
    ).toEqual({ ok: false, error: "This tab is not a GitHub pull request." });
  });

  it("refuses a list-reviewers message without a query", async () => {
    const github = createFakeGitHub([]);

    expect(
      await handleExtensionMessage({ doc: document, fetch: github.fetch }, { type: "list-reviewers" }),
    ).toEqual({ ok: false, error: "The request did not carry a valid search." });
  });

  it("ignores a message meant for something else", async () => {
    const github = createFakeGitHub([]);

    expect(
      await handleExtensionMessage({ doc: document, fetch: github.fetch }, { type: "ping" }),
    ).toBeUndefined();
  });
});
