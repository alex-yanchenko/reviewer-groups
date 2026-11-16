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
        members: ["mona"],
      }),
    ).toEqual({ ok: false, error: "GitHub answered 422." });
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
