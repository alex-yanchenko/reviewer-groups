import { afterEach, describe, expect, it } from "vitest";
import { GitHubAnswerError } from "./githubPage";
import { countOpenReviewRequests, SearchAnswerUnreadableError, SearchLimitedError } from "./openRequests";
import { createFakeGitHub, mountPullRequestPage } from "./testing/fakeGitHub";

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
});

describe("countOpenReviewRequests", () => {
  it("counts the open pull requests waiting on someone's review, from GitHub's search answer", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], { openRequestCounts: { "ada-dev": 4 } });

    expect(await countOpenReviewRequests(github.page, "ada-dev")).toBe(4);
    expect(github.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/search?type=pullrequests&q=is%3Apr+is%3Aopen+review-requested%3Aada-dev+archived%3Afalse",
      { headers: { Accept: "application/json" }, credentials: "same-origin" },
    );
  });

  it("says GitHub is limiting searches when it answers 429", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], { searchStatus: 429 });

    await expect(countOpenReviewRequests(github.page, "ada-dev")).rejects.toThrow(SearchLimitedError);
  });

  it("fails with GitHub's status for any other refusal", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], { searchStatus: 500 });

    await expect(countOpenReviewRequests(github.page, "ada-dev")).rejects.toThrow(new GitHubAnswerError(500));
  });

  it("fails loudly when the answer has no count where GitHub keeps it", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], { searchBody: JSON.stringify({ payload: { results: [] } }) });

    await expect(countOpenReviewRequests(github.page, "ada-dev")).rejects.toThrow(
      SearchAnswerUnreadableError,
    );
  });

  it("fails loudly when the answer is not JSON", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([], { searchBody: "<html>Search</html>" });

    await expect(countOpenReviewRequests(github.page, "ada-dev")).rejects.toThrow(
      SearchAnswerUnreadableError,
    );
  });
});
