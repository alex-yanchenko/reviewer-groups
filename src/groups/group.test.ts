import { describe, expect, it } from "vitest";
import { memberSchema, readGroupOptions, readStoredGroup } from "./group";

describe("readStoredGroup", () => {
  it("returns a well-formed group unchanged", () => {
    const stored = { id: "g1", name: "Backend", members: ["mona", "acme/backend"] };

    expect(readStoredGroup(stored)).toEqual(stored);
  });

  it("keeps the fields a later version added, so saving here does not strip them", () => {
    const stored = { id: "g1", name: "Backend", members: ["ada-dev"], colour: "teal", pinned: true };

    expect(readStoredGroup(stored)).toEqual(stored);
  });

  it("gives nothing back for a group with no members", () => {
    expect(readStoredGroup({ id: "g1", name: "Empty", members: [] })).toBeUndefined();
  });

  it("gives nothing back for a group whose member is not a GitHub login", () => {
    expect(readStoredGroup({ id: "g1", name: "Bad", members: ["not a login"] })).toBeUndefined();
  });

  it("gives nothing back for a value that is not a group", () => {
    expect(readStoredGroup("Backend")).toBeUndefined();
  });
});

describe("readGroupOptions", () => {
  it("drops repository patterns that are not owner/repo or owner/*, keeping the rest", () => {
    expect(
      readGroupOptions({ repos: ["acme/widgets", "*/widgets", "acme", "acme/*", "acme/a/b", 7] }),
    ).toEqual({ repos: ["acme/widgets", "acme/*"] });
  });

  it("leaves repositories out when none of the patterns is valid", () => {
    expect(readGroupOptions({ repos: ["*/*"] })).toEqual({});
  });
});

describe("memberSchema", () => {
  it("accepts a GitHub App's bot login", () => {
    expect(memberSchema.safeParse("dependabot[bot]").success).toBe(true);
  });
});
