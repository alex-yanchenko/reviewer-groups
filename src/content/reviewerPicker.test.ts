import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReviewerOptionsTimeoutError,
  ReviewerPickerMissingError,
  ReviewerSearchFailedError,
  requestReviewFrom,
  searchReviewerCandidates,
} from "./reviewerPicker";
import { mountReviewerSidebar, type Candidate } from "./testing/reviewerSidebarFixture";

const toggleSettles = () => new Promise((resolve) => setTimeout(resolve, 0));

const timeouts = { timeoutMs: 500, searchTimeoutMs: 200 };

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

    const outcome = await requestReviewFrom(document, ["mona", "hubot"], timeouts);
    await toggleSettles();

    expect(outcome).toEqual({ added: ["mona", "hubot"], alreadyRequested: [], notFound: [] });
    expect(fixture.details.open).toBe(false);
    expect(fixture.savedSelections).toEqual([["mona", "hubot", "octocat"]]);
  });

  it("matches a member to the picker regardless of letter case", async () => {
    const fixture = mountReviewerSidebar(document, candidates);

    const outcome = await requestReviewFrom(document, ["MONA"], timeouts);
    await toggleSettles();

    expect(outcome).toEqual({ added: ["MONA"], alreadyRequested: [], notFound: [] });
    expect(fixture.savedSelections).toEqual([["mona", "octocat"]]);
  });

  it("leaves a reviewer who is already requested ticked and reports them", async () => {
    const fixture = mountReviewerSidebar(document, candidates);

    const outcome = await requestReviewFrom(document, ["octocat", "hubot"], timeouts);
    await toggleSettles();

    expect(outcome).toEqual({ added: ["hubot"], alreadyRequested: ["octocat"], notFound: [] });
    expect(fixture.savedSelections).toEqual([["hubot", "octocat"]]);
  });

  it("finds a member outside the default list by typing their login into the menu's filter", async () => {
    const fixture = mountReviewerSidebar(document, candidates, {
      foundOnlyBySearch: [{ login: "spacecat", id: 104 }],
    });

    const outcome = await requestReviewFrom(document, ["spacecat", "mona"], timeouts);
    await toggleSettles();

    expect(outcome).toEqual({ added: ["spacecat", "mona"], alreadyRequested: [], notFound: [] });
    expect(fixture.savedSelections).toEqual([["mona", "octocat", "spacecat"]]);
    expect(fixture.filter.value).toBe("");
  });

  it("reports a member that even a search of the menu does not find, and still requests the rest", async () => {
    const fixture = mountReviewerSidebar(document, candidates);

    const outcome = await requestReviewFrom(document, ["stranger", "mona"], timeouts);
    await toggleSettles();

    expect(outcome).toEqual({ added: ["mona"], alreadyRequested: [], notFound: ["stranger"] });
    expect(fixture.savedSelections).toEqual([["mona", "octocat"]]);
  });

  it("requests a team listed by its org/team slug", async () => {
    const fixture = mountReviewerSidebar(document, candidates);

    const outcome = await requestReviewFrom(document, ["acme/backend"], timeouts);
    await toggleSettles();

    expect(outcome).toEqual({ added: ["acme/backend"], alreadyRequested: [], notFound: [] });
    expect(fixture.savedSelections).toEqual([["octocat", "acme/backend"]]);
  });

  it("waits for the picker to load its options after it opens", async () => {
    const fixture = mountReviewerSidebar(document, candidates, { optionsLoadAfterMs: 120 });

    const outcome = await requestReviewFrom(document, ["hubot"], { timeoutMs: 1000, searchTimeoutMs: 200 });
    await toggleSettles();

    expect(outcome).toEqual({ added: ["hubot"], alreadyRequested: [], notFound: [] });
    expect(fixture.savedSelections).toEqual([["hubot", "octocat"]]);
  });

  it("refuses a page with no reviewer picker, such as a pull request's Files tab", async () => {
    await expect(requestReviewFrom(document, ["mona"], timeouts)).rejects.toThrow(ReviewerPickerMissingError);
  });

  it("closes the menu untouched when its options never load", async () => {
    const fixture = mountReviewerSidebar(document, candidates, { optionsNeverLoad: true });

    await expect(
      requestReviewFrom(document, ["mona"], { timeoutMs: 150, searchTimeoutMs: 100 }),
    ).rejects.toThrow(ReviewerOptionsTimeoutError);
    await toggleSettles();

    expect(fixture.details.open).toBe(false);
    expect(fixture.savedSelections).toEqual([[]]);
  });
});

describe("searchReviewerCandidates", () => {
  const answerWith = (body: unknown, status = 200) =>
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
      );

  it("asks GitHub's reviewer search for the query and returns the people and teams it offers", async () => {
    mountReviewerSidebar(document, []);
    const fetchReviewers = answerWith({
      suggestions: [
        {
          id: 1,
          type: "user",
          selected: false,
          avatar: "https://avatars.githubusercontent.com/in/1",
          login: "Copilot",
          name: {},
          description: "AI reviewer",
        },
      ],
      users: [
        {
          id: 101,
          type: "user",
          selected: true,
          avatar: "https://avatars.githubusercontent.com/u/101",
          login: "mona",
          name: "Mona Lisa",
        },
        {
          id: 900,
          type: "team",
          selected: false,
          avatar: "https://avatars.githubusercontent.com/t/900",
          login: "acme/backend",
          name: "Backend",
        },
      ],
    });

    const found = await searchReviewerCandidates(document, "mo", fetchReviewers);

    expect(found).toEqual([
      {
        login: "Copilot",
        description: "AI reviewer",
        avatarUrl: "https://avatars.githubusercontent.com/in/1",
        team: false,
        requested: false,
      },
      {
        login: "mona",
        description: "Mona Lisa",
        avatarUrl: "https://avatars.githubusercontent.com/u/101",
        team: false,
        requested: true,
      },
      {
        login: "acme/backend",
        description: "Backend",
        avatarUrl: "https://avatars.githubusercontent.com/t/900",
        team: true,
        requested: false,
      },
    ]);
    expect(fetchReviewers).toHaveBeenCalledTimes(1);
    expect(fetchReviewers).toHaveBeenCalledWith(
      "http://localhost:3000/acme/widgets/pull/7/review-requests?typeAhead=true&q=mo",
      { headers: { "X-Requested-With": "XMLHttpRequest" }, credentials: "same-origin" },
    );
  });

  it("skips entries it cannot read and keeps the rest", async () => {
    mountReviewerSidebar(document, []);
    const fetchReviewers = answerWith({
      users: [{ login: 42 }, { id: 102, type: "user", selected: false, login: "hubot" }],
    });

    expect(await searchReviewerCandidates(document, "", fetchReviewers)).toEqual([
      { login: "hubot", description: "", avatarUrl: null, team: false, requested: false },
    ]);
  });

  it("fails with the status when GitHub refuses the search", async () => {
    mountReviewerSidebar(document, []);

    await expect(searchReviewerCandidates(document, "", answerWith({}, 406))).rejects.toThrow(
      new ReviewerSearchFailedError(406),
    );
  });

  it("refuses a page with no reviewer picker", async () => {
    await expect(searchReviewerCandidates(document, "", vi.fn<typeof fetch>())).rejects.toThrow(
      ReviewerPickerMissingError,
    );
  });
});
