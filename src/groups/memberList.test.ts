import { describe, expect, it } from "vitest";
import { parseMemberList } from "./memberList";

describe("parseMemberList", () => {
  it("splits on commas, spaces and new lines and drops a leading @", () => {
    expect(parseMemberList("@octo-cat, mona\nhubot   acme/backend")).toEqual({
      members: ["octo-cat", "mona", "hubot", "acme/backend"],
      invalid: [],
    });
  });

  it("keeps the first spelling of a login that repeats in another case", () => {
    expect(parseMemberList("mona Mona MONA")).toEqual({ members: ["mona"], invalid: [] });
  });

  it("accepts an enterprise managed user login with an underscore suffix", () => {
    expect(parseMemberList("mona_acme")).toEqual({ members: ["mona_acme"], invalid: [] });
  });

  it("reports entries that cannot be a GitHub login or an org/team slug", () => {
    expect(parseMemberList("good -leading a//b way-too-long-login-name-that-github-would-refuse x/")).toEqual(
      {
        members: ["good"],
        invalid: ["-leading", "a//b", "way-too-long-login-name-that-github-would-refuse", "x/"],
      },
    );
  });

  it("returns nothing for blank input", () => {
    expect(parseMemberList("  \n , ")).toEqual({ members: [], invalid: [] });
  });
});
