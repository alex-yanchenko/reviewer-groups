import { describe, expect, it } from "vitest";
import { describePullRequest, parseCandidatesReply, parseReply } from "./activeTab";

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
    const reply = { ok: true, outcome: { added: ["mona"], alreadyRequested: [], notFound: [] } };

    expect(parseReply(reply)).toEqual(reply);
  });

  it("accepts a failure reply from the page", () => {
    expect(parseReply({ ok: false, error: "No picker." })).toEqual({ ok: false, error: "No picker." });
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

  it("passes on a failure the page reported", () => {
    expect(parseCandidatesReply({ ok: false, error: "No picker." })).toEqual({
      ok: false,
      error: "No picker.",
    });
  });

  it("turns anything else into a failure the popup can show", () => {
    expect(parseCandidatesReply("nonsense")).toEqual({
      ok: false,
      error: "The page sent back an unexpected answer.",
    });
  });
});
