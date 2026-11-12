import { describe, expect, it } from "vitest";
import { describeOutcome } from "./messages";

describe("describeOutcome", () => {
  it("names who was requested, who already was, and who GitHub does not offer here", () => {
    expect(
      describeOutcome({ added: ["mona", "hubot"], alreadyRequested: ["octocat"], notFound: ["stranger"] }),
    ).toBe("Requested mona, hubot. Already requested: octocat. Not a reviewer option on this PR: stranger.");
  });

  it("says plainly when nobody new was requested", () => {
    expect(describeOutcome({ added: [], alreadyRequested: ["octocat"], notFound: [] })).toBe(
      "Nobody new to request. Already requested: octocat.",
    );
  });
});
