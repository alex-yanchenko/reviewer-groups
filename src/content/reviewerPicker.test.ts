import { afterEach, describe, expect, it } from "vitest";
import { ReviewerOptionsTimeoutError, ReviewerPickerMissingError, requestReviewFrom } from "./reviewerPicker";
import { mountReviewerSidebar, type Candidate } from "./testing/reviewerSidebarFixture";

const toggleSettles = () => new Promise((resolve) => setTimeout(resolve, 0));

const candidates: Candidate[] = [
  { login: "mona", id: 101 },
  { login: "hubot", id: 102 },
  { login: "octocat", id: 103, requested: true },
  { login: "acme/backend", id: 900, team: true },
];

afterEach(() => {
  document.body.replaceChildren();
});

describe("requestReviewFrom", () => {
  it("ticks every member not yet requested and closes the menu so GitHub saves the selection", async () => {
    const fixture = mountReviewerSidebar(document, candidates);

    const outcome = await requestReviewFrom(document, ["mona", "hubot"], { timeoutMs: 500 });
    await toggleSettles();

    expect(outcome).toEqual({ added: ["mona", "hubot"], alreadyRequested: [], notFound: [] });
    expect(fixture.details.open).toBe(false);
    expect(fixture.savedSelections).toEqual([["mona", "hubot", "octocat"]]);
  });

  it("matches a member to the picker regardless of letter case", async () => {
    const fixture = mountReviewerSidebar(document, candidates);

    const outcome = await requestReviewFrom(document, ["MONA"], { timeoutMs: 500 });
    await toggleSettles();

    expect(outcome).toEqual({ added: ["MONA"], alreadyRequested: [], notFound: [] });
    expect(fixture.savedSelections).toEqual([["mona", "octocat"]]);
  });

  it("leaves a reviewer who is already requested ticked and reports them", async () => {
    const fixture = mountReviewerSidebar(document, candidates);

    const outcome = await requestReviewFrom(document, ["octocat", "hubot"], { timeoutMs: 500 });
    await toggleSettles();

    expect(outcome).toEqual({ added: ["hubot"], alreadyRequested: ["octocat"], notFound: [] });
    expect(fixture.savedSelections).toEqual([["hubot", "octocat"]]);
  });

  it("reports a member the repository does not offer as a reviewer and still requests the rest", async () => {
    const fixture = mountReviewerSidebar(document, candidates);

    const outcome = await requestReviewFrom(document, ["stranger", "mona"], { timeoutMs: 500 });
    await toggleSettles();

    expect(outcome).toEqual({ added: ["mona"], alreadyRequested: [], notFound: ["stranger"] });
    expect(fixture.savedSelections).toEqual([["mona", "octocat"]]);
  });

  it("requests a team listed by its org/team slug", async () => {
    const fixture = mountReviewerSidebar(document, candidates);

    const outcome = await requestReviewFrom(document, ["acme/backend"], { timeoutMs: 500 });
    await toggleSettles();

    expect(outcome).toEqual({ added: ["acme/backend"], alreadyRequested: [], notFound: [] });
    expect(fixture.savedSelections).toEqual([["octocat", "acme/backend"]]);
  });

  it("waits for the picker to load its options after it opens", async () => {
    const fixture = mountReviewerSidebar(document, candidates, { optionsLoadAfterMs: 120 });

    const outcome = await requestReviewFrom(document, ["hubot"], { timeoutMs: 1000 });
    await toggleSettles();

    expect(outcome).toEqual({ added: ["hubot"], alreadyRequested: [], notFound: [] });
    expect(fixture.savedSelections).toEqual([["hubot", "octocat"]]);
  });

  it("refuses a page with no reviewer picker, such as a pull request's Files tab", async () => {
    await expect(requestReviewFrom(document, ["mona"], { timeoutMs: 500 })).rejects.toThrow(
      ReviewerPickerMissingError,
    );
  });

  it("closes the menu untouched when its options never load", async () => {
    const fixture = mountReviewerSidebar(document, candidates, { optionsNeverLoad: true });

    await expect(requestReviewFrom(document, ["mona"], { timeoutMs: 150 })).rejects.toThrow(
      ReviewerOptionsTimeoutError,
    );
    await toggleSettles();

    expect(fixture.details.open).toBe(false);
    expect(fixture.savedSelections).toEqual([[]]);
  });
});
