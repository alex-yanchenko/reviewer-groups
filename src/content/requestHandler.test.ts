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
      await handleExtensionMessage(github.page, {
        type: "request-review",
        session: "popup-1",
        pullRequest: "acme/widgets#7",
        members: ["mona"],
      }),
    ).toEqual({
      ok: true,
      outcome: {
        added: ["mona"],
        alreadyRequested: [],
        unavailable: [],
        notFound: [],
        unconfirmed: [],
        dropped: [],
        gone: [],
      },
    });
  });

  it("answers with the reason when the tab cannot take a request", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub([{ id: 101, login: "mona" }], { conversation: { signedIn: false } });

    expect(
      await handleExtensionMessage(github.page, {
        type: "request-review",
        session: "popup-1",
        pullRequest: "acme/widgets#7",
        members: ["mona"],
      }),
    ).toEqual({ ok: false, error: "Sign in to GitHub in this tab to request reviews." });
  });

  it("reads the Conversation page afresh for each popup session", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub([{ id: 201, login: "ada-dev" }]);

    await handleExtensionMessage(github.page, { type: "list-reviewers", session: "popup-1", query: "" });
    await handleExtensionMessage(github.page, { type: "list-reviewers", session: "popup-1", query: "a" });
    await handleExtensionMessage(github.page, { type: "list-reviewers", session: "popup-2", query: "" });

    expect(github.conversationFetches()).toBe(2);
  });

  it("answers with GitHub's refusal of a request", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([{ id: 101, login: "mona" }], { postStatus: 422 });

    expect(
      await handleExtensionMessage(github.page, {
        type: "request-review",
        session: "popup-1",
        pullRequest: "acme/widgets#7",
        members: ["mona"],
      }),
    ).toEqual({ ok: false, error: "GitHub answered 422." });
  });

  it("refuses a request-review message when the tab shows another pull request than the one it was sent for", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([{ id: 101, login: "mona" }]);

    expect(
      await handleExtensionMessage(github.page, {
        type: "request-review",
        session: "popup-1",
        pullRequest: "acme/widgets#8",
        members: ["mona"],
      }),
    ).toEqual({
      ok: false,
      error: "This tab now shows a different pull request, so nothing was changed.",
    });
    expect(github.posts).toEqual([]);
  });

  it("refuses a request-review message that names no pull request", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([{ id: 101, login: "mona" }]);

    expect(
      await handleExtensionMessage(github.page, {
        type: "request-review",
        session: "popup-1",
        members: ["mona"],
      }),
    ).toEqual({ ok: false, error: "The request did not carry a valid member list." });
    expect(github.posts).toEqual([]);
  });

  it("refuses a request-review message whose members are not GitHub logins", async () => {
    const github = createFakeGitHub([]);

    expect(
      await handleExtensionMessage(github.page, {
        type: "request-review",
        session: "popup-1",
        members: ["not a login"],
      }),
    ).toEqual({ ok: false, error: "The request did not carry a valid member list." });
    expect(github.fetch).not.toHaveBeenCalled();
  });

  it("searches GitHub's reviewer list for a list-reviewers message, with everyone who reviewed", async () => {
    mountPullRequestPage(document, {
      reviewerRows: [{ login: "grace-ops", tooltips: ["grace-ops left review comments"] }],
    });
    const github = createFakeGitHub([{ id: 101, login: "mona", name: "Mona" }]);

    expect(
      await handleExtensionMessage(github.page, { type: "list-reviewers", session: "popup-1", query: "mo" }),
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
      reviewed: [{ login: "grace-ops", reviewState: "commented", requested: false }],
    });
  });

  it("answers a list-reviewers message with the reason when the tab is not a pull request", async () => {
    const github = createFakeGitHub([]);

    expect(
      await handleExtensionMessage(github.page, { type: "list-reviewers", session: "popup-1", query: "" }),
    ).toEqual({ ok: false, error: "This tab is not a GitHub pull request." });
  });

  it("refuses a list-reviewers message without a query", async () => {
    const github = createFakeGitHub([]);

    expect(await handleExtensionMessage(github.page, { type: "list-reviewers", session: "popup-1" })).toEqual(
      { ok: false, error: "The request did not carry a valid search." },
    );
  });

  it("ignores a message meant for something else", async () => {
    const github = createFakeGitHub([]);

    expect(await handleExtensionMessage(github.page, { type: "ping" })).toBeUndefined();
  });
});

describe("handleExtensionMessage looking up a group", () => {
  it("answers with each member as GitHub offers them and the author", async () => {
    mountPullRequestPage(document, { author: "author-dev" });
    const github = createFakeGitHub([{ id: 201, login: "ada-dev" }]);

    expect(
      await handleExtensionMessage(github.page, {
        type: "look-up-group",
        session: "popup-1",
        members: ["ada-dev", "stranger"],
      }),
    ).toEqual({
      ok: true,
      author: "author-dev",
      members: [
        {
          member: "ada-dev",
          candidate: {
            login: "ada-dev",
            description: "",
            avatarUrl: "https://avatars.githubusercontent.com/u/201",
            team: false,
            requested: false,
            available: true,
            reviewState: null,
          },
        },
        { member: "stranger", candidate: null },
      ],
    });
  });

  it("refuses a look-up whose members are not GitHub logins", async () => {
    const github = createFakeGitHub([]);

    expect(
      await handleExtensionMessage(github.page, {
        type: "look-up-group",
        session: "popup-1",
        members: ["a b"],
      }),
    ).toEqual({ ok: false, error: "The request did not carry a valid member list." });
  });
});

describe("handleExtensionMessage removing reviewers", () => {
  const removeMessage = (pullRequest: string) => ({
    type: "remove-reviewers",
    session: "popup-1",
    pullRequest,
    members: ["ada-dev"],
  });

  it("removes the people named from this pull request", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([{ id: 201, login: "ada-dev", selected: true }]);

    expect(await handleExtensionMessage(github.page, removeMessage("acme/widgets#7"))).toEqual({
      ok: true,
      outcome: { removed: ["ada-dev"], notRequested: [], unconfirmed: [], dropped: [] },
    });
  });

  it("refuses when the tab now shows another pull request than the one requested on", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([{ id: 201, login: "ada-dev", selected: true }]);

    expect(await handleExtensionMessage(github.page, removeMessage("acme/widgets#8"))).toEqual({
      ok: false,
      error: "This tab now shows a different pull request, so nothing was changed.",
    });
    expect(github.posts).toEqual([]);
  });
});

describe("handleExtensionMessage counting open review requests", () => {
  const countMessage = (login: string) => ({ type: "count-open-requests", session: "popup-1", login });

  it("answers with the count GitHub's search gives", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], { openRequestCounts: { "grace-ops": 3 } });

    expect(await handleExtensionMessage(github.page, countMessage("grace-ops"))).toEqual({
      ok: true,
      count: 3,
    });
  });

  it("marks the failure as a search limit when GitHub answers 429", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], { searchStatus: 429 });

    expect(await handleExtensionMessage(github.page, countMessage("grace-ops"))).toEqual({
      ok: false,
      error: "GitHub is limiting searches; counts paused.",
      limited: true,
    });
  });

  it("answers with an ordinary failure when the search answer cannot be read", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], { searchBody: "{}" });

    expect(await handleExtensionMessage(github.page, countMessage("grace-ops"))).toEqual({
      ok: false,
      error: "Counts unavailable.",
      limited: false,
    });
  });

  it("refuses to count a team, whose requests the search cannot see", async () => {
    const github = createFakeGitHub([]);

    expect(await handleExtensionMessage(github.page, countMessage("acme/backend"))).toEqual({
      ok: false,
      error: "The request did not carry a person's login.",
      limited: false,
    });
    expect(github.fetch).not.toHaveBeenCalled();
  });
});
