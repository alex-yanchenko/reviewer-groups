import { describe, expect, it } from "vitest";
import { describePullRequest, parseReply } from "./activeTab";

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
