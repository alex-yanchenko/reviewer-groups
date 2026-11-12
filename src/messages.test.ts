import { describe, expect, it } from "vitest";
import { describeOutcome } from "./messages";

describe("describeOutcome", () => {
  it("names who was requested and every reason someone was not", () => {
    expect(
      describeOutcome({
        added: ["mona", "hubot"],
        alreadyRequested: ["octocat"],
        unavailable: ["away-person"],
        notFound: ["stranger"],
        unconfirmed: ["spacecat"],
      }),
    ).toBe(
      "Requested mona, hubot. Already requested: octocat. Not available to review: away-person. Not a reviewer option on this PR: stranger. GitHub did not confirm: spacecat. Check the pull request.",
    );
  });

  it("says plainly when nobody new was requested", () => {
    expect(
      describeOutcome({
        added: [],
        alreadyRequested: ["octocat"],
        unavailable: [],
        notFound: [],
        unconfirmed: [],
      }),
    ).toBe("Nobody new to request. Already requested: octocat.");
  });
});
