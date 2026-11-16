import { describe, expect, it } from "vitest";
import type { Group } from "./group";
import { exportGroups, mergeImportedGroups, readGroupFile } from "./groupFile";

const platform: Group = {
  id: "g1",
  name: "Platform",
  members: ["ada-dev", "grace-ops"],
  repos: ["acme/*"],
  ask: 1,
};
const docsSite: Group = { id: "g2", name: "Docs site", members: ["joan-ux"] };

describe("exportGroups", () => {
  it("writes a versioned file holding every group with its repositories and ask", () => {
    expect(JSON.parse(exportGroups([platform, docsSite]))).toEqual({
      version: 1,
      groups: [platform, docsSite],
    });
  });
});

describe("readGroupFile", () => {
  it("reads the groups an export wrote", () => {
    expect(readGroupFile(exportGroups([platform, docsSite]))).toEqual({
      ok: true,
      groups: [platform, docsSite],
    });
  });

  it("keeps fields a later version added to a group", () => {
    const later = { ...docsSite, colour: "teal" };

    expect(readGroupFile(JSON.stringify({ version: 1, groups: [later] }))).toEqual({
      ok: true,
      groups: [later],
    });
  });

  it("reads a group without an id, since import gives every group a new one", () => {
    const withoutId = { name: "Docs site", members: ["joan-ux"] };

    expect(readGroupFile(JSON.stringify({ version: 1, groups: [withoutId] }))).toEqual({
      ok: true,
      groups: [withoutId],
    });
  });

  it("refuses a file from a newer version", () => {
    expect(readGroupFile(JSON.stringify({ version: 2, groups: [] }))).toEqual({
      ok: false,
      error: "This file comes from a newer version of Reviewer Groups. Update the extension, then import it.",
    });
  });

  it("refuses a file that is not JSON", () => {
    expect(readGroupFile("name,members")).toEqual({ ok: false, error: "This file is not JSON." });
  });

  it("refuses JSON that is not a Reviewer Groups export", () => {
    expect(readGroupFile(JSON.stringify([platform]))).toEqual({
      ok: false,
      error: "This file is not a Reviewer Groups export.",
    });
  });

  it("refuses the whole file when one group in it is not valid, naming which", () => {
    const badPattern = { ...docsSite, repos: ["*/docs"] };

    expect(readGroupFile(JSON.stringify({ version: 1, groups: [platform, badPattern] }))).toEqual({
      ok: false,
      error: "Group 2 in this file is not valid, so nothing was imported.",
    });
  });
});

describe("mergeImportedGroups", () => {
  const ids = () => {
    let next = 0;
    return () => {
      next += 1;
      return `new-${next}`;
    };
  };

  it("adds imported groups after the saved ones, each with a new id", () => {
    expect(mergeImportedGroups([docsSite], [platform], ids())).toEqual({
      groups: [docsSite, { ...platform, id: "new-1" }],
      addedIds: ["new-1"],
      skipped: 0,
    });
  });

  it("skips a group whose name and members match a saved one, ignoring case and order", () => {
    const same = { name: "platform ", members: ["Grace-Ops", "ada-dev"] };

    expect(mergeImportedGroups([platform], [same], ids())).toEqual({
      groups: [platform],
      addedIds: [],
      skipped: 1,
    });
  });

  it("skips a group that repeats one earlier in the same file", () => {
    expect(mergeImportedGroups([], [docsSite, docsSite], ids())).toEqual({
      groups: [{ ...docsSite, id: "new-1" }],
      addedIds: ["new-1"],
      skipped: 1,
    });
  });

  it("adds a group with the same name but other members", () => {
    const otherPlatform = { name: "Platform", members: ["linus-qa"] };

    expect(mergeImportedGroups([platform], [otherPlatform], ids())).toEqual({
      groups: [platform, { ...otherPlatform, id: "new-1" }],
      addedIds: ["new-1"],
      skipped: 0,
    });
  });
});
