import { describe, expect, it } from "vitest";
import { parseStoredGroups, StoredGroupsInvalidError } from "./group";

describe("parseStoredGroups", () => {
  it("reads a missing value as no groups yet", () => {
    expect(parseStoredGroups(undefined)).toEqual([]);
  });

  it("returns stored groups unchanged when they are well formed", () => {
    const stored = [
      { id: "3b0e6f0a-8f43-4a43-9a43-0d9c5e1f2a10", name: "Backend", members: ["mona", "acme/backend"] },
    ];

    expect(parseStoredGroups(stored)).toEqual(stored);
  });

  it("refuses a group with no members", () => {
    expect(() => parseStoredGroups([{ id: "a", name: "Empty", members: [] }])).toThrow(
      StoredGroupsInvalidError,
    );
  });

  it("refuses a group whose member is not a GitHub login", () => {
    expect(() => parseStoredGroups([{ id: "a", name: "Bad", members: ["not a login"] }])).toThrow(
      StoredGroupsInvalidError,
    );
  });
});
