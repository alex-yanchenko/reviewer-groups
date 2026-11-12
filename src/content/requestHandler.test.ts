import { afterEach, describe, expect, it, vi } from "vitest";
import { handleExtensionMessage } from "./requestHandler";
import { mountReviewerSidebar } from "./testing/reviewerSidebarFixture";

afterEach(() => {
  document.body.replaceChildren();
});

describe("handleExtensionMessage", () => {
  it("requests review from the members in a request-review message", async () => {
    mountReviewerSidebar(document, [{ login: "mona", id: 101 }]);

    expect(await handleExtensionMessage(document, { type: "request-review", members: ["mona"] })).toEqual({
      ok: true,
      outcome: { added: ["mona"], alreadyRequested: [], notFound: [] },
    });
  });

  it("answers with the reason when the tab has no Reviewers picker", async () => {
    expect(await handleExtensionMessage(document, { type: "request-review", members: ["mona"] })).toEqual({
      ok: false,
      error: "This page has no Reviewers picker. Open the pull request's Conversation tab.",
    });
  });

  it("refuses a request-review message whose members are not GitHub logins", async () => {
    expect(
      await handleExtensionMessage(document, { type: "request-review", members: ["not a login"] }),
    ).toEqual({
      ok: false,
      error: "The request did not carry a valid member list.",
    });
  });

  it("searches GitHub's reviewer list for a list-reviewers message", async () => {
    mountReviewerSidebar(document, []);
    const fetchReviewers = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ users: [{ type: "user", selected: false, login: "mona", name: "Mona" }] }),
        ),
      );
    vi.stubGlobal("fetch", fetchReviewers);

    expect(await handleExtensionMessage(document, { type: "list-reviewers", query: "mo" })).toEqual({
      ok: true,
      candidates: [{ login: "mona", description: "Mona", avatarUrl: null, team: false, requested: false }],
    });
    expect(fetchReviewers).toHaveBeenCalledTimes(1);
  });

  it("answers a list-reviewers message with GitHub's refusal", async () => {
    mountReviewerSidebar(document, []);
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 406 })));

    expect(await handleExtensionMessage(document, { type: "list-reviewers", query: "" })).toEqual({
      ok: false,
      error: "GitHub's reviewer search answered 406.",
    });
  });

  it("answers a list-reviewers message with the reason when the tab has no Reviewers picker", async () => {
    expect(await handleExtensionMessage(document, { type: "list-reviewers", query: "" })).toEqual({
      ok: false,
      error: "This page has no Reviewers picker. Open the pull request's Conversation tab.",
    });
  });

  it("refuses a list-reviewers message without a query", async () => {
    expect(await handleExtensionMessage(document, { type: "list-reviewers" })).toEqual({
      ok: false,
      error: "The request did not carry a valid search.",
    });
  });

  it("ignores a message meant for something else", async () => {
    expect(await handleExtensionMessage(document, { type: "ping" })).toBeUndefined();
  });
});
