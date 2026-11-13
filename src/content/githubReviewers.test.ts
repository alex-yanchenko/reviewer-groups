import { afterEach, describe, expect, it } from "vitest";
import {
  GitHubAnswerError,
  GitHubAnswerUnreadableError,
  PullRequestPageMissingError,
  RequestInProgressError,
  ReviewerFormMissingError,
  requestReviewFrom,
  searchReviewerCandidates,
} from "./githubReviewers";
import { createFakeGitHub, mountPullRequestPage, type FakePerson } from "./testing/fakeGitHub";

const people = (): FakePerson[] => [
  { id: 101, login: "mona", name: "Mona Lisa" },
  { id: 102, login: "hubot" },
  { id: 103, login: "octocat", selected: true },
  { id: 104, login: "monalisa-bot", suggested: false },
  { id: 105, login: "away-person", disabled: true },
  { id: 900, login: "acme/backend", team: true, name: "Backend" },
];

const reviewerFields = (body: URLSearchParams | undefined) => [...(body?.entries() ?? [])];

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
});

describe("requestReviewFrom", () => {
  it("sends GitHub the current reviewers plus the new ones, with the page form's other fields", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());

    const outcome = await requestReviewFrom({ doc: document, fetch: github.fetch }, ["mona", "acme/backend"]);

    expect(outcome).toEqual({
      added: ["mona", "acme/backend"],
      alreadyRequested: [],
      unavailable: [],
      notFound: [],
      unconfirmed: [],
      gone: [],
    });
    expect(github.posts).toHaveLength(1);
    expect(reviewerFields(github.posts[0])).toEqual([
      ["authenticity_token", "page-token"],
      ["partial_last_updated", "1700000000"],
      ["dummy-field-just-to-avoid-empty-submit", "foo"],
      ["review_effort_level", "medium"],
      ["reviewer_user_ids[]", "103"],
      ["reviewer_user_ids[]", "101"],
      ["reviewer_team_ids[]", "900"],
    ]);
    expect(github.requestedLogins()).toEqual(["mona", "octocat", "acme/backend"]);
  });

  it("posts to the form's address with the headers GitHub's own page sends", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());

    await requestReviewFrom({ doc: document, fetch: github.fetch }, ["hubot"]);

    const post = github.fetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("http://localhost:3000/acme/widgets/pull/7/review-requests");
    expect(post?.[1]?.headers).toEqual({ Accept: "text/html", "X-Requested-With": "XMLHttpRequest" });
    expect(post?.[1]?.credentials).toBe("same-origin");
  });

  it("takes the current reviewers from GitHub, never from a page form that has gone stale", async () => {
    mountPullRequestPage(document, { staleReviewerIds: [102, 103] });
    const github = createFakeGitHub(people());

    await requestReviewFrom({ doc: document, fetch: github.fetch }, ["mona"]);

    expect(github.posts[0]?.getAll("reviewer_user_ids[]")).toEqual(["103", "101"]);
    expect(github.requestedLogins()).toEqual(["mona", "octocat"]);
  });

  it("swaps the page's Reviewers box for the fresh one GitHub sends back", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());

    await requestReviewFrom({ doc: document, fetch: github.fetch }, ["hubot"]);

    expect(document.querySelector(".page-sidebar")).toBeNull();
    expect(document.querySelector(".fresh-sidebar")?.textContent).toBe("hubot,octocat");
  });

  it("matches members to GitHub's logins regardless of letter case", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());

    const outcome = await requestReviewFrom({ doc: document, fetch: github.fetch }, ["MONA"]);

    expect(outcome).toEqual({
      added: ["MONA"],
      alreadyRequested: [],
      unavailable: [],
      notFound: [],
      unconfirmed: [],
      gone: [],
    });
  });

  it("finds someone outside GitHub's suggestions by searching for their login", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());

    const outcome = await requestReviewFrom({ doc: document, fetch: github.fetch }, ["monalisa-bot"]);

    expect(outcome.added).toEqual(["monalisa-bot"]);
    expect(github.requestedLogins()).toEqual(["octocat", "monalisa-bot"]);
  });

  it("sorts members GitHub will not take into their own lists and sends only the rest", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());

    const outcome = await requestReviewFrom({ doc: document, fetch: github.fetch }, [
      "octocat",
      "away-person",
      "mon",
      "hubot",
    ]);

    expect(outcome).toEqual({
      added: ["hubot"],
      alreadyRequested: ["octocat"],
      unavailable: ["away-person"],
      notFound: ["mon"],
      unconfirmed: [],
      gone: [],
    });
    expect(github.posts[0]?.getAll("reviewer_user_ids[]")).toEqual(["103", "102"]);
  });

  it("checks the GitHub profile of every member not offered, and reports the ones that no longer exist", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people(), {
      missingAccounts: ["renamed-person", "acme/old-team", "retired-app[bot]"],
    });

    const outcome = await requestReviewFrom({ doc: document, fetch: github.fetch }, [
      "renamed-person",
      "outside-collaborator",
      "acme/old-team",
      "retired-app[bot]",
      "mona",
    ]);

    expect(outcome).toEqual({
      added: ["mona"],
      alreadyRequested: [],
      unavailable: [],
      notFound: ["outside-collaborator"],
      unconfirmed: [],
      gone: ["renamed-person", "acme/old-team", "retired-app[bot]"],
    });
    expect(github.profileChecks).toEqual([
      "/renamed-person",
      "/outside-collaborator",
      "/orgs/acme/teams/old-team",
      "/apps/retired-app",
    ]);
  });

  it("keeps a member under not offered when GitHub's profile answer is neither found nor missing", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people(), { profileStatus: 503 });

    const outcome = await requestReviewFrom({ doc: document, fetch: github.fetch }, ["stranger"]);

    expect(outcome).toEqual({
      added: [],
      alreadyRequested: [],
      unavailable: [],
      notFound: ["stranger"],
      unconfirmed: [],
      gone: [],
    });
  });

  it("sends nothing when nobody new needs requesting", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());

    const outcome = await requestReviewFrom({ doc: document, fetch: github.fetch }, ["octocat", "stranger"]);

    expect(outcome).toEqual({
      added: [],
      alreadyRequested: ["octocat"],
      unavailable: [],
      notFound: ["stranger"],
      unconfirmed: [],
      gone: [],
    });
    expect(github.posts).toEqual([]);
  });

  it("reports members GitHub does not show as requested afterwards", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people(), { postIgnored: true });

    const outcome = await requestReviewFrom({ doc: document, fetch: github.fetch }, ["mona"]);

    expect(outcome).toEqual({
      added: [],
      alreadyRequested: [],
      unavailable: [],
      notFound: [],
      unconfirmed: ["mona"],
      gone: [],
    });
  });

  it("fails with GitHub's status when it refuses the request, leaving the page alone", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people(), { postStatus: 422 });

    await expect(requestReviewFrom({ doc: document, fetch: github.fetch }, ["mona"])).rejects.toThrow(
      new GitHubAnswerError(422),
    );
    expect(document.querySelector(".page-sidebar")).not.toBeNull();
  });

  it("refuses a second request while the first is still running", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());
    const context = { doc: document, fetch: github.fetch };

    const first = requestReviewFrom(context, ["mona"]);
    await expect(requestReviewFrom(context, ["hubot"])).rejects.toThrow(RequestInProgressError);
    await first;

    expect(github.requestedLogins()).toEqual(["mona", "octocat"]);
  });

  it("accepts a new request once the previous one has failed", async () => {
    mountPullRequestPage(document);
    const failing = createFakeGitHub(people(), { postStatus: 500 });
    await expect(requestReviewFrom({ doc: document, fetch: failing.fetch }, ["mona"])).rejects.toThrow(
      GitHubAnswerError,
    );
    const github = createFakeGitHub(people());

    const outcome = await requestReviewFrom({ doc: document, fetch: github.fetch }, ["mona"]);

    expect(outcome.added).toEqual(["mona"]);
  });

  it("asks for the Conversation tab, where GitHub keeps the reviewer form", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub(people());

    await expect(requestReviewFrom({ doc: document, fetch: github.fetch }, ["mona"])).rejects.toThrow(
      ReviewerFormMissingError,
    );
  });

  it("refuses a page that is not a pull request", async () => {
    const github = createFakeGitHub(people());

    await expect(requestReviewFrom({ doc: document, fetch: github.fetch }, ["mona"])).rejects.toThrow(
      PullRequestPageMissingError,
    );
  });
});

describe("searchReviewerCandidates review states", () => {
  it("adds the review each person already left, read from the page's Reviewers box", async () => {
    mountPullRequestPage(document, {
      reviewerRows: [
        { login: "mona", tooltips: ["mona approved these changes"] },
        { login: "hubot", tooltips: ["hubot requested changes", "Re-request review"] },
        { login: "octocat", tooltips: ["Awaiting requested review from octocat"] },
        {
          login: "monalisa-bot",
          tooltips: ["monalisa-bot left review comments", "Re-request review"],
          menuIcons: 3,
        },
      ],
    });
    const github = createFakeGitHub([
      { id: 101, login: "mona" },
      { id: 102, login: "hubot" },
      { id: 103, login: "octocat", selected: true },
      { id: 104, login: "monalisa-bot" },
      { id: 105, login: "away-person" },
    ]);

    const found = await searchReviewerCandidates({ doc: document, fetch: github.fetch }, "");

    expect(found.map(({ login, reviewState }) => [login, reviewState])).toEqual([
      ["mona", "approved"],
      ["hubot", "changesRequested"],
      ["octocat", null],
      ["monalisa-bot", "commented"],
      ["away-person", null],
    ]);
  });

  it("matches a reviewer row to a login regardless of letter case", async () => {
    mountPullRequestPage(document, {
      reviewerRows: [{ login: "Mona", tooltips: ["Mona approved these changes"] }],
    });
    const github = createFakeGitHub([{ id: 101, login: "mona" }]);

    const [mona] = await searchReviewerCandidates({ doc: document, fetch: github.fetch }, "");

    expect(mona?.reviewState).toBe("approved");
  });

  it("leaves review states empty on a tab without the Reviewers box", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub([{ id: 101, login: "mona" }]);

    const [mona] = await searchReviewerCandidates({ doc: document, fetch: github.fetch }, "");

    expect(mona?.reviewState).toBeNull();
  });
});

describe("searchReviewerCandidates", () => {
  it("lists the people and teams GitHub offers, from any tab of the pull request", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub(people());

    const found = await searchReviewerCandidates({ doc: document, fetch: github.fetch }, "o");

    expect(found).toEqual([
      {
        login: "mona",
        description: "Mona Lisa",
        avatarUrl: "https://avatars.githubusercontent.com/u/101",
        team: false,
        requested: false,
        available: true,
        reviewState: null,
      },
      {
        login: "hubot",
        description: "",
        avatarUrl: "https://avatars.githubusercontent.com/u/102",
        team: false,
        requested: false,
        available: true,
        reviewState: null,
      },
      {
        login: "octocat",
        description: "",
        avatarUrl: "https://avatars.githubusercontent.com/u/103",
        team: false,
        requested: true,
        available: true,
        reviewState: null,
      },
      {
        login: "monalisa-bot",
        description: "",
        avatarUrl: "https://avatars.githubusercontent.com/u/104",
        team: false,
        requested: false,
        available: true,
        reviewState: null,
      },
      {
        login: "away-person",
        description: "",
        avatarUrl: "https://avatars.githubusercontent.com/u/105",
        team: false,
        requested: false,
        available: false,
        reviewState: null,
      },
    ]);
    expect(github.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/acme/widgets/pull/7/review-requests?typeAhead=true&q=o",
      { headers: { "X-Requested-With": "XMLHttpRequest" }, credentials: "same-origin" },
    );
  });

  it("uses the description of an entry with no display name", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], {
      searchAnswer: {
        suggestions: [
          { id: 1, type: "user", login: "Copilot", name: {}, description: "AI reviewer", selected: false },
        ],
      },
    });

    expect(await searchReviewerCandidates({ doc: document, fetch: github.fetch }, "")).toEqual([
      {
        login: "Copilot",
        description: "AI reviewer",
        avatarUrl: null,
        team: false,
        requested: false,
        available: true,
        reviewState: null,
      },
    ]);
  });

  it("keeps the readable entries when some are not", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], {
      searchAnswer: { users: [{ login: 42 }, { id: 102, type: "user", login: "hubot", selected: false }] },
    });

    expect(await searchReviewerCandidates({ doc: document, fetch: github.fetch }, "")).toEqual([
      {
        login: "hubot",
        description: "",
        avatarUrl: null,
        team: false,
        requested: false,
        available: true,
        reviewState: null,
      },
    ]);
  });

  it("fails loudly when none of GitHub's entries can be read", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], { searchAnswer: { users: [{ handle: "mona" }] } });

    await expect(searchReviewerCandidates({ doc: document, fetch: github.fetch }, "")).rejects.toThrow(
      GitHubAnswerUnreadableError,
    );
  });

  it("fails loudly when GitHub's answer has an unknown shape", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], { searchAnswer: ["mona"] });

    await expect(searchReviewerCandidates({ doc: document, fetch: github.fetch }, "")).rejects.toThrow(
      GitHubAnswerUnreadableError,
    );
  });

  it("returns nobody when GitHub finds nobody", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], { searchAnswer: { suggestions: [], users: [] } });

    expect(await searchReviewerCandidates({ doc: document, fetch: github.fetch }, "zzz")).toEqual([]);
  });

  it("fails with GitHub's status when it refuses the search", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([]);
    github.fetch.mockResolvedValueOnce(new Response("", { status: 404 }));

    await expect(searchReviewerCandidates({ doc: document, fetch: github.fetch }, "")).rejects.toThrow(
      new GitHubAnswerError(404),
    );
  });

  it("refuses a page that is not a pull request", async () => {
    const github = createFakeGitHub([]);

    await expect(searchReviewerCandidates({ doc: document, fetch: github.fetch }, "")).rejects.toThrow(
      PullRequestPageMissingError,
    );
  });
});
