import { describe, expect, it, vi } from "vitest";
import { describePullRequest, listReviewersInTab, parseCandidatesReply, parseReply } from "./activeTab";

const emptyOutcome = {
  added: [],
  alreadyRequested: [],
  unavailable: [],
  notFound: [],
  unconfirmed: [],
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
    const reply = { ok: true, outcome: { ...emptyOutcome, added: ["mona"], unconfirmed: ["hubot"] } };

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
  };

  it("accepts the reviewer list the page read", () => {
    expect(parseCandidatesReply({ ok: true, candidates: [mona] })).toEqual({ ok: true, candidates: [mona] });
  });

  it("drops an avatar served from anywhere but GitHub's avatar host", () => {
    expect(
      parseCandidatesReply({
        ok: true,
        candidates: [{ ...mona, avatarUrl: "https://tracker.test/pixel.png" }],
      }),
    ).toEqual({ ok: true, candidates: [{ ...mona, avatarUrl: null }] });
  });

  it("drops a candidate whose login is not a GitHub login", () => {
    expect(parseCandidatesReply({ ok: true, candidates: [mona, { ...mona, login: "<img>" }] })).toEqual({
      ok: true,
      candidates: [mona],
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

describe("listReviewersInTab", () => {
  const stubChrome = (sendMessage: ReturnType<typeof vi.fn>) => {
    const executeScript = vi.fn().mockResolvedValue([]);
    vi.stubGlobal("chrome", { tabs: { sendMessage }, scripting: { executeScript } });
    return executeScript;
  };

  it("asks the script already in the tab without injecting it again", async () => {
    const sendMessage = vi.fn().mockResolvedValueOnce({ ok: true, candidates: [] });
    const executeScript = stubChrome(sendMessage);

    expect(await listReviewersInTab(7, "mo")).toEqual({ ok: true, candidates: [] });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(7, { type: "list-reviewers", query: "mo" });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("injects the script when the tab has none yet, then asks again", async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("Receiving end does not exist."))
      .mockResolvedValueOnce({ ok: true, candidates: [] });
    const executeScript = stubChrome(sendMessage);

    expect(await listReviewersInTab(7, "")).toEqual({ ok: true, candidates: [] });
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ["picker.js"] });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("says when Chrome cannot reach the tab at all", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("Receiving end does not exist."));
    stubChrome(sendMessage);

    expect(await listReviewersInTab(7, "")).toEqual({
      ok: false,
      error:
        "Chrome could not reach this tab (Receiving end does not exist.). Reload the pull request and try again.",
    });
  });
});
