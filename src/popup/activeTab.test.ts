import { describe, expect, it, vi } from "vitest";
import {
  countOpenRequestsInTab,
  describePullRequest,
  listReviewersInTab,
  parseCandidatesReply,
  parseCountReply,
  parseLookUpReply,
  parseRemoveReply,
  parseReply,
} from "./activeTab";

const emptyOutcome = {
  added: [],
  alreadyRequested: [],
  unavailable: [],
  notFound: [],
  unconfirmed: [],
  dropped: [],
  gone: [],
};

describe("describePullRequest", () => {
  it("names the repository and number of a pull request page", () => {
    expect(describePullRequest("https://github.com/acme/widgets/pull/7")).toBe("acme/widgets#7");
  });

  it("recognises a pull request's other tabs and anchors", () => {
    expect(describePullRequest("https://github.com/acme/widgets/pull/7/files#diff-1")).toBe("acme/widgets#7");
  });

  it("returns null for a page that is not a pull request", () => {
    expect(describePullRequest("https://github.com/acme/widgets/issues/7")).toBeNull();
  });

  it("returns null for a look-alike host", () => {
    expect(describePullRequest("https://github.com.evil.test/acme/widgets/pull/7")).toBeNull();
  });

  it("returns null when Chrome gives no address", () => {
    expect(describePullRequest(undefined)).toBeNull();
  });
});

describe("parseReply", () => {
  it("accepts a successful reply from the page", () => {
    const reply = {
      ok: true,
      outcome: { ...emptyOutcome, added: ["mona"], unconfirmed: ["hubot"], dropped: ["linus-qa"] },
    };

    expect(parseReply(reply)).toEqual(reply);
  });

  it("accepts a failure reply from the page", () => {
    expect(parseReply({ ok: false, error: "No form." })).toEqual({ ok: false, error: "No form." });
  });

  it("turns anything else into a failure the popup can show", () => {
    expect(parseReply(undefined)).toEqual({ ok: false, error: "The page sent back an unexpected answer." });
  });
});

describe("parseCandidatesReply", () => {
  const mona = {
    login: "mona",
    description: "Mona Lisa",
    avatarUrl: "https://avatars.githubusercontent.com/u/101?v=4",
    team: false,
    requested: false,
    available: true,
    reviewState: "commented",
  };

  const grace = { login: "grace-ops", reviewState: "changesRequested", requested: false };

  it("accepts the reviewer list the page read, with everyone who reviewed", () => {
    expect(parseCandidatesReply({ ok: true, candidates: [mona], reviewed: [grace] })).toEqual({
      ok: true,
      candidates: [mona],
      reviewed: [grace],
    });
  });

  it("reads a reply without a reviewed list as nobody having reviewed", () => {
    expect(parseCandidatesReply({ ok: true, candidates: [mona] })).toEqual({
      ok: true,
      candidates: [mona],
      reviewed: [],
    });
  });

  it("drops a reviewed entry whose login is not a GitHub login", () => {
    expect(
      parseCandidatesReply({ ok: true, candidates: [], reviewed: [grace, { ...grace, login: "<img>" }] }),
    ).toEqual({ ok: true, candidates: [], reviewed: [grace] });
  });

  it("drops an avatar served from anywhere but GitHub's avatar host", () => {
    expect(
      parseCandidatesReply({
        ok: true,
        candidates: [{ ...mona, avatarUrl: "https://tracker.test/pixel.png" }],
        reviewed: [],
      }),
    ).toEqual({ ok: true, candidates: [{ ...mona, avatarUrl: null }], reviewed: [] });
  });

  it("drops a candidate whose login is not a GitHub login", () => {
    expect(
      parseCandidatesReply({ ok: true, candidates: [mona, { ...mona, login: "<img>" }], reviewed: [] }),
    ).toEqual({
      ok: true,
      candidates: [mona],
      reviewed: [],
    });
  });

  it("fails loudly when the page sent candidates and none can be read", () => {
    expect(parseCandidatesReply({ ok: true, candidates: [{ ...mona, login: "<img>" }] })).toEqual({
      ok: false,
      error: "The page sent back an unexpected answer.",
    });
  });

  it("passes on a failure the page reported", () => {
    expect(parseCandidatesReply({ ok: false, error: "No form." })).toEqual({ ok: false, error: "No form." });
  });

  it("turns anything else into a failure the popup can show", () => {
    expect(parseCandidatesReply("nonsense")).toEqual({
      ok: false,
      error: "The page sent back an unexpected answer.",
    });
  });
});

describe("parseLookUpReply", () => {
  const ada = {
    login: "ada-dev",
    description: "",
    avatarUrl: "https://avatars.githubusercontent.com/u/201",
    team: false,
    requested: false,
    available: true,
    reviewState: null,
  };

  it("accepts each member as the page found them, and the author", () => {
    const reply = {
      ok: true,
      author: "author-dev",
      members: [
        { member: "ada-dev", candidate: ada },
        { member: "stranger", candidate: null },
      ],
    };

    expect(parseLookUpReply(reply)).toEqual(reply);
  });

  it("drops an avatar served from anywhere but GitHub's avatar host", () => {
    expect(
      parseLookUpReply({
        ok: true,
        author: null,
        members: [{ member: "ada-dev", candidate: { ...ada, avatarUrl: "https://tracker.test/pixel.png" } }],
      }),
    ).toEqual({
      ok: true,
      author: null,
      members: [{ member: "ada-dev", candidate: { ...ada, avatarUrl: null } }],
    });
  });

  it("turns a member it cannot read into a failure the popup can show", () => {
    expect(
      parseLookUpReply({ ok: true, author: null, members: [{ member: "ada-dev", candidate: { login: 1 } }] }),
    ).toEqual({ ok: false, error: "The page sent back an unexpected answer." });
  });
});

describe("parseRemoveReply", () => {
  it("accepts who the page removed", () => {
    const reply = {
      ok: true,
      outcome: { removed: ["ada-dev"], notRequested: ["grace-ops"], unconfirmed: [], dropped: [] },
    };

    expect(parseRemoveReply(reply)).toEqual(reply);
  });

  it("turns anything else into a failure the popup can show", () => {
    expect(parseRemoveReply({ ok: true, outcome: { removed: "ada-dev" } })).toEqual({
      ok: false,
      error: "The page sent back an unexpected answer.",
    });
  });
});

describe("parseCountReply", () => {
  it("accepts a count from the page", () => {
    expect(parseCountReply({ ok: true, count: 4 })).toEqual({ ok: true, count: 4 });
  });

  it("accepts a search limit the page reported", () => {
    const limited = { ok: false, error: "GitHub is limiting searches; counts paused.", limited: true };

    expect(parseCountReply(limited)).toEqual(limited);
  });

  it("turns anything else into counts being unavailable", () => {
    expect(parseCountReply({ ok: true, count: -1 })).toEqual({
      ok: false,
      error: "Counts unavailable.",
      limited: false,
    });
  });
});

describe("listReviewersInTab", () => {
  const popupTab = { id: 7, session: "popup-1" };

  type ChromeAnswer = { response: unknown } | { lastError: string };

  const unreachable: ChromeAnswer = { lastError: "Receiving end does not exist." };

  const stubChrome = (...answers: ChromeAnswer[]) => {
    const runtime: { lastError?: { message: string } } = {};
    const sendMessage = vi.fn(
      (
        _tabId: number,
        _message: { type: string; data: unknown },
        _options: unknown,
        callback: (response: unknown) => void,
      ) => {
        const answer = answers.shift() ?? unreachable;
        if ("lastError" in answer) runtime.lastError = { message: answer.lastError };
        callback("response" in answer ? answer.response : undefined);
        delete runtime.lastError;
      },
    );
    const executeScript = vi.fn().mockResolvedValue([]);
    vi.stubGlobal("chrome", { runtime, tabs: { sendMessage }, scripting: { executeScript } });
    return { sendMessage, executeScript };
  };

  it("asks the script already in the tab without injecting it again", async () => {
    const { sendMessage, executeScript } = stubChrome({ response: { res: { ok: true, candidates: [] } } });

    expect(await listReviewersInTab(popupTab, "mo")).toEqual({ ok: true, candidates: [], reviewed: [] });
    expect(sendMessage.mock.calls.map(([tabId, { type, data }]) => ({ tabId, type, data }))).toEqual([
      { tabId: 7, type: "list-reviewers", data: { session: "popup-1", query: "mo" } },
    ]);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("injects the script when the tab has none yet, then asks again", async () => {
    const { sendMessage, executeScript } = stubChrome(unreachable, {
      response: { res: { ok: true, candidates: [] } },
    });

    expect(await listReviewersInTab(popupTab, "")).toEqual({ ok: true, candidates: [], reviewed: [] });
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ["picker.js"] });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("says when Chrome cannot reach the tab at all", async () => {
    stubChrome(unreachable, unreachable);

    expect(await listReviewersInTab(popupTab, "")).toEqual({
      ok: false,
      error:
        "Chrome could not reach this tab (Receiving end does not exist.). Reload the pull request and try again.",
    });
  });

  it("says the page could not finish when the script failed inside the tab, without injecting it again", async () => {
    const { sendMessage, executeScript } = stubChrome({
      response: {
        err: {
          name: "PageCouldNotFinishError",
          message: "The page could not finish: Failed to fetch",
          stack: "",
        },
      },
    });

    expect(await listReviewersInTab(popupTab, "")).toEqual({
      ok: false,
      error: "The page could not finish: Failed to fetch",
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("calls counts unavailable when the script failed inside the tab while counting", async () => {
    stubChrome({
      response: {
        err: {
          name: "PageCouldNotFinishError",
          message: "The page could not finish: Failed to fetch",
          stack: "",
        },
      },
    });

    expect(await countOpenRequestsInTab(popupTab, "ada-dev")).toEqual({
      ok: false,
      error: "Counts unavailable.",
      limited: false,
    });
  });
});
