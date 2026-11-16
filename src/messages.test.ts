import { describe, expect, it } from "vitest";
import { describeOutcome, describeRemoval } from "./messages";

describe("describeOutcome", () => {
  it("names who was requested and every reason someone was not", () => {
    expect(
      describeOutcome({
        added: ["mona", "hubot"],
        alreadyRequested: ["octocat"],
        unavailable: ["away-person"],
        notFound: ["stranger"],
        unconfirmed: ["spacecat"],
        dropped: ["linus-qa"],
        gone: ["renamed-person"],
      }),
    ).toBe(
      "Requested mona, hubot. Already requested: octocat. Not available to review: away-person. Not a reviewer option on this PR: stranger. No longer on GitHub: renamed-person. Remove them from your groups. GitHub did not confirm: spacecat. Check the pull request. GitHub also removed: linus-qa. Check the pull request.",
    );
  });

  it("names the people GitHub dropped after a removal", () => {
    expect(
      describeRemoval({
        removed: ["ada-dev"],
        notRequested: [],
        unconfirmed: ["grace-ops"],
        dropped: ["linus-qa"],
      }),
    ).toBe(
      "Removed ada-dev. GitHub did not confirm removing: grace-ops. Check the pull request. GitHub also removed: linus-qa. Check the pull request.",
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
        dropped: [],
        gone: [],
      }),
    ).toBe("Nobody new to request. Already requested: octocat.");
  });
});
