import { describe, expect, it } from "vitest";
import { memberSchema, readStoredGroup } from "./group";

describe("readStoredGroup", () => {
  it("returns a well-formed group unchanged", () => {
    const stored = { id: "g1", name: "Backend", members: ["mona", "acme/backend"] };

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

describe("memberSchema", () => {
  it("accepts a GitHub App's bot login", () => {
    expect(memberSchema.safeParse("dependabot[bot]").success).toBe(true);
  });
});
