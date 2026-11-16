import { afterEach, describe, expect, it } from "vitest";
import {
  ConversationPageUnreadableError,
  NotSignedInError,
  PullRequestChangedError,
  PullRequestPageMissingError,
  ReviewerFormMissingError,
} from "./conversationPage";
import {
  GitHubAnswerError,
  GitHubAnswerUnreadableError,
  RequestInProgressError,
  requestReviewFrom,
  listReviewers,
  lookUpGroup,
  removeReviewersFrom,
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

    const outcome = await requestReviewFrom(github.page, ["mona", "acme/backend"]);

    expect(outcome).toEqual({
      added: ["mona", "acme/backend"],
      alreadyRequested: [],
      unavailable: [],
      notFound: [],
      unconfirmed: [],
      dropped: [],
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

    await requestReviewFrom(github.page, ["hubot"]);

    const post = github.fetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("http://localhost:3000/acme/widgets/pull/7/review-requests");
    expect(post?.[1]?.headers).toEqual({ Accept: "text/html", "X-Requested-With": "XMLHttpRequest" });
    expect(post?.[1]?.credentials).toBe("same-origin");
  });

  it("takes the current reviewers from GitHub, never from a page form that has gone stale", async () => {
    mountPullRequestPage(document, { staleReviewerIds: [102, 103] });
    const github = createFakeGitHub(people());

    await requestReviewFrom(github.page, ["mona"]);

    expect(github.posts[0]?.getAll("reviewer_user_ids[]")).toEqual(["103", "101"]);
    expect(github.requestedLogins()).toEqual(["mona", "octocat"]);
  });

  it("swaps the page's Reviewers box for the fresh one GitHub sends back", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());

    await requestReviewFrom(github.page, ["hubot"]);

    expect(document.querySelector(".page-sidebar")).toBeNull();
    expect(document.querySelector(".fresh-sidebar")?.textContent).toBe("hubot,octocat");
  });

  it("matches members to GitHub's logins regardless of letter case", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());

    const outcome = await requestReviewFrom(github.page, ["MONA"]);

    expect(outcome).toEqual({
      added: ["MONA"],
      alreadyRequested: [],
      unavailable: [],
      notFound: [],
      unconfirmed: [],
      dropped: [],
      gone: [],
    });
  });

  it("finds someone outside GitHub's suggestions by searching for their login", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());

    const outcome = await requestReviewFrom(github.page, ["monalisa-bot"]);

    expect(outcome.added).toEqual(["monalisa-bot"]);
    expect(github.requestedLogins()).toEqual(["octocat", "monalisa-bot"]);
  });

  it("sorts members GitHub will not take into their own lists and sends only the rest", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());

    const outcome = await requestReviewFrom(github.page, ["octocat", "away-person", "mon", "hubot"]);

    expect(outcome).toEqual({
      added: ["hubot"],
      alreadyRequested: ["octocat"],
      unavailable: ["away-person"],
      notFound: ["mon"],
      unconfirmed: [],
      dropped: [],
      gone: [],
    });
    expect(github.posts[0]?.getAll("reviewer_user_ids[]")).toEqual(["103", "102"]);
  });

  it("checks the GitHub profile of every member not offered, and reports the ones that no longer exist", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people(), {
      missingAccounts: ["renamed-person", "acme/old-team", "retired-app[bot]"],
    });

    const outcome = await requestReviewFrom(github.page, [
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
      dropped: [],
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

    const outcome = await requestReviewFrom(github.page, ["stranger"]);

    expect(outcome).toEqual({
      added: [],
      alreadyRequested: [],
      unavailable: [],
      notFound: ["stranger"],
      unconfirmed: [],
      dropped: [],
      gone: [],
    });
  });

  it("sends nothing when nobody new needs requesting", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());

    const outcome = await requestReviewFrom(github.page, ["octocat", "stranger"]);

    expect(outcome).toEqual({
      added: [],
      alreadyRequested: ["octocat"],
      unavailable: [],
      notFound: ["stranger"],
      unconfirmed: [],
      dropped: [],
      gone: [],
    });
    expect(github.posts).toEqual([]);
  });

  it("reports members GitHub does not show as requested afterwards", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people(), { postIgnored: true });

    const outcome = await requestReviewFrom(github.page, ["mona"]);

    expect(outcome).toEqual({
      added: [],
      alreadyRequested: [],
      unavailable: [],
      notFound: [],
      unconfirmed: ["mona"],
      dropped: [],
      gone: [],
    });
  });

  it("fails with GitHub's status when it refuses the request, leaving the page alone", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people(), { postStatus: 422 });

    await expect(requestReviewFrom(github.page, ["mona"])).rejects.toThrow(new GitHubAnswerError(422));
    expect(document.querySelector(".page-sidebar")).not.toBeNull();
  });

  it("refuses a second request while the first is still running", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());
    const context = github.page;

    const first = requestReviewFrom(context, ["mona"]);
    await expect(requestReviewFrom(context, ["hubot"])).rejects.toThrow(RequestInProgressError);
    await first;

    expect(github.requestedLogins()).toEqual(["mona", "octocat"]);
  });

  it("accepts a new request once the previous one has failed", async () => {
    mountPullRequestPage(document);
    const failing = createFakeGitHub(people(), { postStatus: 500 });
    await expect(requestReviewFrom(failing.page, ["mona"])).rejects.toThrow(GitHubAnswerError);
    const github = createFakeGitHub(people());

    const outcome = await requestReviewFrom(github.page, ["mona"]);

    expect(outcome.added).toEqual(["mona"]);
  });

  it("finds the form again for every post, since the previous post replaced the Reviewers box", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());

    await requestReviewFrom(github.page, ["mona"]);
    await requestReviewFrom(github.page, ["hubot"]);

    expect(github.posts.map((post) => post.get("authenticity_token"))).toEqual(["page-token", "fresh-token"]);
  });

  it("refuses a page that is not a pull request", async () => {
    const github = createFakeGitHub(people());

    await expect(requestReviewFrom(github.page, ["mona"])).rejects.toThrow(PullRequestPageMissingError);
  });
});

describe("listReviewers", () => {
  it("lists everyone in the Reviewers box who left a review, suggested or not, and whether each is requested again", async () => {
    mountPullRequestPage(document, {
      reviewerRows: [
        { login: "ada-dev", tooltips: ["ada-dev approved these changes"] },
        { login: "grace-ops", tooltips: ["grace-ops requested changes", "Re-request review"] },
        { login: "linus-qa", tooltips: ["linus-qa left review comments"] },
        { login: "joan-ux", tooltips: ["Awaiting requested review from joan-ux"] },
      ],
    });
    const github = createFakeGitHub([
      { id: 201, login: "ada-dev", suggested: false },
      { id: 202, login: "grace-ops", selected: true },
      { id: 203, login: "linus-qa" },
      { id: 204, login: "joan-ux", selected: true },
    ]);

    const list = await listReviewers(github.page, "");

    expect(list.reviewed).toEqual([
      { login: "ada-dev", reviewState: "approved", requested: false },
      { login: "grace-ops", reviewState: "changesRequested", requested: true },
      { login: "linus-qa", reviewState: "commented", requested: false },
    ]);
    expect(list.candidates.map(({ login }) => login)).toEqual(["grace-ops", "linus-qa", "joan-ux"]);
  });

  it("marks a reviewer as requested from GitHub's current requests, whatever the search typed", async () => {
    mountPullRequestPage(document, {
      reviewerRows: [
        { login: "ada-dev", tooltips: ["ada-dev approved these changes"] },
        { login: "grace-ops", tooltips: ["grace-ops requested changes"] },
      ],
    });
    const github = createFakeGitHub(
      [
        { id: 201, login: "ada-dev", selected: true },
        { id: 202, login: "grace-ops" },
        { id: 203, login: "linus-qa" },
      ],
      { searchFiltersRequested: true },
    );

    const list = await listReviewers(github.page, "linus");

    expect(list.reviewed).toEqual([
      { login: "ada-dev", reviewState: "approved", requested: true },
      { login: "grace-ops", reviewState: "changesRequested", requested: false },
    ]);
  });

  it("re-requests someone who reviewed by sending them like anyone else not requested", async () => {
    mountPullRequestPage(document, {
      reviewerRows: [{ login: "grace-ops", tooltips: ["grace-ops requested changes"] }],
    });
    const github = createFakeGitHub([
      { id: 202, login: "grace-ops" },
      { id: 204, login: "joan-ux", selected: true },
    ]);

    const outcome = await requestReviewFrom(github.page, ["grace-ops"]);

    expect(outcome.added).toEqual(["grace-ops"]);
    expect(github.posts[0]?.getAll("reviewer_user_ids[]")).toEqual(["204", "202"]);
    expect(github.posts[0]?.has("re_request_reviewer_id")).toBe(false);
  });
});

describe("lookUpGroup", () => {
  it("describes each member as GitHub offers them, with any review left, and names the pull request's author", async () => {
    mountPullRequestPage(document, {
      author: "author-dev",
      reviewerRows: [{ login: "joan-ux", tooltips: ["joan-ux left review comments"] }],
    });
    const github = createFakeGitHub([
      { id: 201, login: "ada-dev", suggested: false },
      { id: 202, login: "grace-ops", selected: true },
      { id: 203, login: "linus-qa", disabled: true },
      { id: 204, login: "joan-ux" },
    ]);

    const lookup = await lookUpGroup(github.page, [
      "ada-dev",
      "grace-ops",
      "linus-qa",
      "joan-ux",
      "stranger",
    ]);

    const person = (login: string, id: number, overrides: object = {}) => ({
      login,
      description: "",
      avatarUrl: `https://avatars.githubusercontent.com/u/${id}`,
      team: false,
      requested: false,
      available: true,
      reviewState: null,
      ...overrides,
    });
    expect(lookup).toEqual({
      author: "author-dev",
      members: [
        { member: "ada-dev", candidate: person("ada-dev", 201) },
        { member: "grace-ops", candidate: person("grace-ops", 202, { requested: true }) },
        { member: "linus-qa", candidate: person("linus-qa", 203, { available: false }) },
        { member: "joan-ux", candidate: person("joan-ux", 204, { reviewState: "commented" }) },
        { member: "stranger", candidate: null },
      ],
    });
  });

  it("reads the author from the Conversation page on another tab", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub([{ id: 201, login: "ada-dev" }], {
      conversation: { author: "author-dev" },
    });

    expect((await lookUpGroup(github.page, ["ada-dev"])).author).toBe("author-dev");
  });

  it("leaves the author unknown when the page does not show one", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([{ id: 201, login: "ada-dev" }]);

    expect((await lookUpGroup(github.page, ["ada-dev"])).author).toBeNull();
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

    const found = await searchReviewerCandidates(github.page, "");

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

    const [mona] = await searchReviewerCandidates(github.page, "");

    expect(mona?.reviewState).toBe("approved");
  });

  it("reads review states from the Conversation page on a tab without the Reviewers box", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub([{ id: 201, login: "ada-dev" }], {
      conversation: { reviewerRows: [{ login: "ada-dev", tooltips: ["ada-dev approved these changes"] }] },
    });

    const [ada] = await searchReviewerCandidates(github.page, "");

    expect(ada?.reviewState).toBe("approved");
  });
});

describe("removeReviewersFrom", () => {
  const team = (): FakePerson[] => [
    { id: 201, login: "ada-dev", selected: true },
    { id: 202, login: "grace-ops", selected: true },
    { id: 203, login: "linus-qa" },
    { id: 900, login: "acme/web", team: true, selected: true },
  ];

  it("takes the given people off the request and keeps everyone else requested", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(team());

    const outcome = await removeReviewersFrom(github.page, ["Ada-Dev"]);

    expect(outcome).toEqual({ removed: ["Ada-Dev"], notRequested: [], unconfirmed: [], dropped: [] });
    expect(github.posts[0]?.getAll("reviewer_user_ids[]")).toEqual(["202"]);
    expect(github.posts[0]?.getAll("reviewer_team_ids[]")).toEqual(["900"]);
    expect(github.requestedLogins()).toEqual(["grace-ops", "acme/web"]);
  });

  it("leaves alone someone no longer requested and posts nothing when nobody is", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(team());

    const outcome = await removeReviewersFrom(github.page, ["linus-qa"]);

    expect(outcome).toEqual({ removed: [], notRequested: ["linus-qa"], unconfirmed: [], dropped: [] });
    expect(github.posts).toEqual([]);
  });

  it("reports a removal GitHub does not show afterwards", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(team(), { postIgnored: true });

    const outcome = await removeReviewersFrom(github.page, ["ada-dev"]);

    expect(outcome).toEqual({ removed: [], notRequested: [], unconfirmed: ["ada-dev"], dropped: [] });
  });

  it("refuses a removal while a request is still running in the same tab", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(team());

    const request = requestReviewFrom(github.page, ["linus-qa"]);
    await expect(removeReviewersFrom(github.page, ["ada-dev"])).rejects.toThrow(RequestInProgressError);
    await request;
  });
});

describe("a pull request tab without the Reviewers form", () => {
  const team = (): FakePerson[] => [
    { id: 201, login: "ada-dev" },
    { id: 202, login: "grace-ops", selected: true },
  ];

  it("requests through the form on the pull request's Conversation page, leaving this tab's page alone", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub(team());

    const outcome = await requestReviewFrom(github.page, ["ada-dev"]);

    expect(outcome).toEqual({
      added: ["ada-dev"],
      alreadyRequested: [],
      unavailable: [],
      notFound: [],
      unconfirmed: [],
      dropped: [],
      gone: [],
    });
    expect(github.fetch).toHaveBeenCalledWith("http://localhost:3000/acme/widgets/pull/7", {
      headers: { Accept: "text/html" },
      credentials: "same-origin",
    });
    expect(reviewerFields(github.posts[0])).toEqual([
      ["authenticity_token", "conversation-token"],
      ["partial_last_updated", "1700000000"],
      ["dummy-field-just-to-avoid-empty-submit", "foo"],
      ["review_effort_level", "medium"],
      ["reviewer_user_ids[]", "202"],
      ["reviewer_user_ids[]", "201"],
    ]);
    expect(document.querySelector(".fresh-sidebar")).toBeNull();
  });

  it("reads the Conversation page once per popup session", async () => {
    mountPullRequestPage(document, { tab: "/commits", withForm: false });
    const github = createFakeGitHub(team());

    github.page.conversation.enterSession("popup-1");
    await searchReviewerCandidates(github.page, "");
    await searchReviewerCandidates(github.page, "ad");
    github.page.conversation.enterSession("popup-2");
    await searchReviewerCandidates(github.page, "");

    expect(github.conversationFetches()).toBe(2);
  });

  it("reads the Conversation page again after a request, since its form and states changed", async () => {
    mountPullRequestPage(document, { tab: "/checks", withForm: false });
    const github = createFakeGitHub(team());
    github.page.conversation.enterSession("popup-1");

    await requestReviewFrom(github.page, ["ada-dev"]);
    await searchReviewerCandidates(github.page, "");

    expect(github.conversationFetches()).toBe(2);
  });

  it("says to sign in when GitHub shows the page signed out", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub(team(), { conversation: { signedIn: false } });

    await expect(requestReviewFrom(github.page, ["ada-dev"])).rejects.toThrow(NotSignedInError);
  });

  it("says to sign in when GitHub sends the page to its login screen", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub(team(), { conversation: { redirectedToLogin: true } });

    await expect(requestReviewFrom(github.page, ["ada-dev"])).rejects.toThrow(NotSignedInError);
  });

  it("says the account cannot request reviewers when a signed-in page has no Reviewers form", async () => {
    mountPullRequestPage(document, { withForm: false });
    const github = createFakeGitHub(team(), { conversation: { canRequest: false } });

    await expect(requestReviewFrom(github.page, ["ada-dev"])).rejects.toThrow(new ReviewerFormMissingError());
    expect(new ReviewerFormMissingError().message).toBe(
      "Your GitHub account cannot request reviewers on this pull request.",
    );
  });

  it("fails loudly when the Conversation page is not one it can read", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub(team(), { conversation: { unreadable: true } });

    await expect(requestReviewFrom(github.page, ["ada-dev"])).rejects.toThrow(
      ConversationPageUnreadableError,
    );
  });

  it("refuses a form that posts anywhere but this pull request's review requests", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub(team(), {
      conversation: { formAction: "/acme/other/pull/9/review-requests" },
    });

    await expect(requestReviewFrom(github.page, ["ada-dev"])).rejects.toThrow(
      ConversationPageUnreadableError,
    );
    expect(github.posts).toEqual([]);
  });

  it("fails with GitHub's status when the Conversation page does not load", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub(team(), { conversation: { status: 404 } });

    await expect(requestReviewFrom(github.page, ["ada-dev"])).rejects.toThrow(new GitHubAnswerError(404));
  });
});

describe("searchReviewerCandidates", () => {
  it("lists the people and teams GitHub offers, from any tab of the pull request", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub(people());

    const found = await searchReviewerCandidates(github.page, "o");

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

    expect(await searchReviewerCandidates(github.page, "")).toEqual([
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

    expect(await searchReviewerCandidates(github.page, "")).toEqual([
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

    await expect(searchReviewerCandidates(github.page, "")).rejects.toThrow(GitHubAnswerUnreadableError);
  });

  it("fails loudly when GitHub's answer has an unknown shape", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], { searchAnswer: ["mona"] });

    await expect(searchReviewerCandidates(github.page, "")).rejects.toThrow(GitHubAnswerUnreadableError);
  });

  it("returns nobody when GitHub finds nobody", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], { searchAnswer: { suggestions: [], users: [] } });

    expect(await searchReviewerCandidates(github.page, "zzz")).toEqual([]);
  });

  it("fails with GitHub's status when it refuses the search", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([]);
    github.fetch.mockResolvedValueOnce(new Response("", { status: 404 }));

    await expect(searchReviewerCandidates(github.page, "")).rejects.toThrow(new GitHubAnswerError(404));
  });

  it("refuses a page that is not a pull request", async () => {
    const github = createFakeGitHub([]);

    await expect(searchReviewerCandidates(github.page, "")).rejects.toThrow(PullRequestPageMissingError);
  });
});

describe("a typeahead answer that is not GitHub's reviewer list", () => {
  it("says to sign in when the answer is a page with GitHub's sign-in form", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([]);
    github.fetch.mockResolvedValueOnce(
      new Response('<html><body><form action="/session" method="post"></form></body></html>'),
    );

    await expect(searchReviewerCandidates(github.page, "")).rejects.toThrow(NotSignedInError);
  });

  it("says the answer is unreadable when it is a page without a sign-in form", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([]);
    github.fetch.mockResolvedValueOnce(
      new Response("<html><body>Unicorn! This page is taking too long</body></html>"),
    );

    await expect(searchReviewerCandidates(github.page, "")).rejects.toThrow(GitHubAnswerUnreadableError);
  });

  it("says the answer is unreadable when it is empty", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([]);
    github.fetch.mockResolvedValueOnce(new Response(""));

    await expect(searchReviewerCandidates(github.page, "")).rejects.toThrow(GitHubAnswerUnreadableError);
  });

  it("says to sign in when GitHub sends the typeahead to its login screen", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([]);
    const redirected = new Response("{}");
    Object.defineProperty(redirected, "url", { value: "https://github.com/login?return_to=%2Facme" });
    github.fetch.mockResolvedValueOnce(redirected);

    await expect(searchReviewerCandidates(github.page, "")).rejects.toThrow(NotSignedInError);
  });
});

describe("a write when the tab navigates to another pull request mid-way", () => {
  const SECOND_PULL_REQUEST = "/acme/widgets/pull/8";

  const navigateAfterCurrentReviewersRead = (
    github: ReturnType<typeof createFakeGitHub>,
    navigate: () => void,
  ) => {
    const original = github.fetch.getMockImplementation();
    if (original === undefined) throw new Error("the fake fetch has no implementation");
    let navigated = false;
    github.fetch.mockImplementation(async (input, init) => {
      const response = await original(input, init);
      const url = addressOf(input);
      if (!navigated && url.searchParams.get("typeAhead") === "true" && url.searchParams.get("q") === "") {
        navigated = true;
        navigate();
      }
      return response;
    });
  };

  const addressOf = (input: Parameters<typeof fetch>[0]) =>
    new URL(input instanceof Request ? input.url : input, window.location.origin);

  const postedTo = (github: ReturnType<typeof createFakeGitHub>) =>
    github.fetch.mock.calls.filter(([, init]) => init?.method === "POST").map(([url]) => addressOf(url).href);

  it("refuses to post when the tab's live form now belongs to the second pull request", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());
    navigateAfterCurrentReviewersRead(github, () => {
      document.body.replaceChildren();
      mountPullRequestPage(document, { path: SECOND_PULL_REQUEST });
    });

    await expect(requestReviewFrom(github.page, ["mona"])).rejects.toThrow(PullRequestChangedError);

    expect(github.posts).toEqual([]);
  });

  it("refuses to remove when the tab's live form now belongs to the second pull request", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([{ id: 201, login: "ada-dev", selected: true }]);
    navigateAfterCurrentReviewersRead(github, () => {
      document.body.replaceChildren();
      mountPullRequestPage(document, { path: SECOND_PULL_REQUEST });
    });

    await expect(removeReviewersFrom(github.page, ["ada-dev"])).rejects.toThrow(PullRequestChangedError);

    expect(github.posts).toEqual([]);
  });

  it("keeps every address of the write on the first pull request when the second tab shows no form", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(people());
    navigateAfterCurrentReviewersRead(github, () => {
      document.body.replaceChildren();
      mountPullRequestPage(document, { path: SECOND_PULL_REQUEST, tab: "/files", withForm: false });
    });

    const outcome = await requestReviewFrom(github.page, ["mona"]);

    expect(outcome.added).toEqual(["mona"]);
    expect(postedTo(github)).toEqual(["http://localhost:3000/acme/widgets/pull/7/review-requests"]);
    const typeaheadPaths = github.fetch.mock.calls
      .map(([url]) => addressOf(url))
      .filter((url) => url.searchParams.has("typeAhead"))
      .map((url) => url.pathname);
    expect([...new Set(typeaheadPaths)]).toEqual(["/acme/widgets/pull/7/review-requests"]);
  });
});

describe("a read when the tab navigates to another pull request mid-way", () => {
  const addressOf = (input: Parameters<typeof fetch>[0]) =>
    new URL(input instanceof Request ? input.url : input, window.location.origin);

  const navigateAfterFirstTypeahead = (github: ReturnType<typeof createFakeGitHub>) => {
    const original = github.fetch.getMockImplementation();
    if (original === undefined) throw new Error("the fake fetch has no implementation");
    let navigated = false;
    github.fetch.mockImplementation(async (input, init) => {
      const response = await original(input, init);
      if (!navigated && addressOf(input).searchParams.has("typeAhead")) {
        navigated = true;
        window.history.replaceState({}, "", "/acme/widgets/pull/8/files");
      }
      return response;
    });
  };

  const pathsFetched = (github: ReturnType<typeof createFakeGitHub>) => {
    const urls = github.fetch.mock.calls.map(([input]) => addressOf(input));
    return {
      conversation: urls.filter((url) => /\/pull\/\d+$/.test(url.pathname)).map((url) => url.pathname),
      typeahead: [
        ...new Set(urls.filter((url) => url.searchParams.has("typeAhead")).map((url) => url.pathname)),
      ],
    };
  };

  const team = (): FakePerson[] => [
    { id: 201, login: "ada-dev" },
    { id: 202, login: "grace-ops", selected: true },
  ];

  it("lists reviewers from the first pull request only", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub(team());
    navigateAfterFirstTypeahead(github);

    await listReviewers(github.page, "");

    expect(pathsFetched(github)).toEqual({
      conversation: ["/acme/widgets/pull/7"],
      typeahead: ["/acme/widgets/pull/7/review-requests"],
    });
  });

  it("looks a group up on the first pull request only", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub(team());
    navigateAfterFirstTypeahead(github);

    await lookUpGroup(github.page, ["ada-dev", "grace-ops"]);

    expect(pathsFetched(github)).toEqual({
      conversation: ["/acme/widgets/pull/7"],
      typeahead: ["/acme/widgets/pull/7/review-requests"],
    });
  });

  it("never returns the cached Conversation page of another pull request", async () => {
    mountPullRequestPage(document, { tab: "/files", withForm: false });
    const github = createFakeGitHub(team());
    github.page.conversation.enterSession("popup-1");
    await searchReviewerCandidates(github.page, "");

    window.history.replaceState({}, "", "/acme/widgets/pull/8/files");
    await searchReviewerCandidates(github.page, "");

    expect(pathsFetched(github).conversation).toEqual(["/acme/widgets/pull/7", "/acme/widgets/pull/8"]);
  });
});

describe("a write never drops someone already requested", () => {
  it("keeps a requested team whose entry carries a null description in the post", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([
      { id: 101, login: "mona" },
      { id: 900, login: "acme/web", team: true, selected: true, description: null },
    ]);

    const outcome = await requestReviewFrom(github.page, ["mona"]);

    expect(outcome.added).toEqual(["mona"]);
    expect(github.posts[0]?.getAll("reviewer_team_ids[]")).toEqual(["900"]);
    expect(github.requestedLogins()).toEqual(["mona", "acme/web"]);
  });

  it("keeps a requested team with a null description when removing someone else", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([
      { id: 201, login: "ada-dev", selected: true },
      { id: 900, login: "acme/web", team: true, selected: true, description: null },
    ]);

    await removeReviewersFrom(github.page, ["ada-dev"]);

    expect(github.requestedLogins()).toEqual(["acme/web"]);
  });

  it("refuses to post when a requested entry cannot be read", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], {
      searchAnswer: {
        users: [
          { id: 201, type: "user", login: "ada-dev", selected: true, avatar: 42 },
          { id: 101, type: "user", login: "mona", selected: false },
        ],
      },
    });

    await expect(requestReviewFrom(github.page, ["mona"])).rejects.toThrow(GitHubAnswerUnreadableError);
    expect(github.posts).toEqual([]);
  });

  it("reports someone requested before and not requested afterwards as dropped by GitHub", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(
      [
        { id: 101, login: "mona" },
        { id: 103, login: "octocat", selected: true },
      ],
      { dropsOnPost: ["octocat"] },
    );

    const outcome = await requestReviewFrom(github.page, ["mona"]);

    expect(outcome).toEqual({
      added: ["mona"],
      alreadyRequested: [],
      unavailable: [],
      notFound: [],
      unconfirmed: [],
      dropped: ["octocat"],
      gone: [],
    });
  });

  it("keeps the people asked for apart from the people GitHub dropped", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(
      [
        { id: 101, login: "mona" },
        { id: 103, login: "octocat", selected: true },
      ],
      { dropsOnPost: ["mona", "octocat"] },
    );

    const outcome = await requestReviewFrom(github.page, ["mona"]);

    expect(outcome).toEqual({
      added: [],
      alreadyRequested: [],
      unavailable: [],
      notFound: [],
      unconfirmed: ["mona"],
      dropped: ["octocat"],
      gone: [],
    });
  });

  it("reports someone dropped by a removal of another person as dropped by GitHub", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(
      [
        { id: 201, login: "ada-dev", selected: true },
        { id: 202, login: "grace-ops", selected: true },
      ],
      { dropsOnPost: ["grace-ops"] },
    );

    const outcome = await removeReviewersFrom(github.page, ["ada-dev"]);

    expect(outcome).toEqual({
      removed: ["ada-dev"],
      notRequested: [],
      unconfirmed: [],
      dropped: ["grace-ops"],
    });
  });
});

describe("the read that confirms a write after GitHub accepted it", () => {
  const answerTypeaheadAfterPost = (
    github: ReturnType<typeof createFakeGitHub>,
    answer: () => Response | Promise<Response>,
  ) => {
    const original = github.fetch.getMockImplementation();
    if (original === undefined) throw new Error("the fake fetch has no implementation");
    let posted = false;
    github.fetch.mockImplementation((input, init) => {
      if (init?.method === "POST") posted = true;
      const isTypeahead = String(input instanceof Request ? input.url : input).includes("typeAhead=true");
      return posted && isTypeahead ? Promise.resolve(answer()) : original(input, init);
    });
  };

  const twoPeople = (): FakePerson[] => [
    { id: 101, login: "mona" },
    { id: 103, login: "octocat", selected: true },
  ];

  it("reports the people asked for as unconfirmed when the confirming answer is not JSON", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(twoPeople());
    answerTypeaheadAfterPost(github, () => new Response("<html><body>unicorn</body></html>"));

    const outcome = await requestReviewFrom(github.page, ["mona"]);

    expect(outcome).toEqual({
      added: [],
      alreadyRequested: [],
      unavailable: [],
      notFound: [],
      unconfirmed: ["mona"],
      dropped: [],
      gone: [],
    });
    expect(github.requestedLogins()).toEqual(["mona", "octocat"]);
  });

  it("reports a removal as unconfirmed when the confirming read fails", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(twoPeople());
    answerTypeaheadAfterPost(github, () => new Response("", { status: 502 }));

    const outcome = await removeReviewersFrom(github.page, ["octocat"]);

    expect(outcome).toEqual({ removed: [], notRequested: [], unconfirmed: ["octocat"], dropped: [] });
  });

  it("confirms the readable people when a requested entry in the confirming answer cannot be read", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub(twoPeople());
    answerTypeaheadAfterPost(github, () =>
      Response.json({
        users: [
          { id: 101, type: "user", login: "mona", selected: true },
          { id: 103, type: "user", login: "octocat", selected: true, avatar: 42 },
        ],
      }),
    );

    const outcome = await requestReviewFrom(github.page, ["mona"]);

    expect(outcome).toEqual({
      added: ["mona"],
      alreadyRequested: [],
      unavailable: [],
      notFound: [],
      unconfirmed: [],
      dropped: [],
      gone: [],
    });
  });
});
