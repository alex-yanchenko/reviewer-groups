import { afterEach, describe, expect, it } from "vitest";
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

  it("ignores a message meant for something else", async () => {
    expect(await handleExtensionMessage(document, { type: "ping" })).toBeUndefined();
  });
});
