import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { ReviewerCandidate } from "../messages";
import {
  EMPTY_DIRECTORY,
  isGone,
  loadDirectory,
  markGone,
  rememberPeople,
  rememberedPeople,
  saveDirectory,
} from "./directory";
import { DIRECTORY_KEY, directoryItem } from "./storedItems";

beforeEach(() => {
  fakeBrowser.reset();
});

const mona = { login: "mona", description: "Mona Lisa", avatarUrl: null, team: false };
const team = { login: "acme/backend", description: "Backend", avatarUrl: null, team: true };

const found = (login: string, overrides: Partial<ReviewerCandidate> = {}): ReviewerCandidate => ({
  login,
  description: "",
  avatarUrl: null,
  team: false,
  requested: false,
  available: true,
  reviewState: null,
  ...overrides,
});

const storeDirectory = (directory: unknown) => fakeBrowser.storage.local.set({ [DIRECTORY_KEY]: directory });

describe("loadDirectory", () => {
  it("returns the people and missing logins saved before", async () => {
    const saved = { people: { mona, "acme/backend": team }, gone: ["renamed-person"] };
    await storeDirectory(saved);

    expect(await loadDirectory(directoryItem)).toEqual(saved);
  });

  it("drops a saved person it cannot read and keeps the rest", async () => {
    await storeDirectory({ people: { mona, broken: { login: 42 } }, gone: [] });

    expect(await loadDirectory(directoryItem)).toEqual({ people: { mona }, gone: [] });
  });

  it("drops a saved avatar that is not on GitHub's avatar host", async () => {
    await storeDirectory({
      people: { mona: { ...mona, avatarUrl: "https://tracker.test/p.png" } },
      gone: [],
    });

    expect(await loadDirectory(directoryItem)).toEqual({ people: { mona }, gone: [] });
  });

  it("starts empty when nothing was saved or the saved value is not a directory", async () => {
    expect(await loadDirectory(directoryItem)).toEqual(EMPTY_DIRECTORY);
    await storeDirectory("nonsense");
    expect(await loadDirectory(directoryItem)).toEqual(EMPTY_DIRECTORY);
  });
});

describe("saveDirectory", () => {
  it("writes the directory under its key", async () => {
    const directory = { people: { mona }, gone: ["renamed-person"] };

    await saveDirectory(directoryItem, directory);

    expect(await fakeBrowser.storage.local.get(null)).toEqual({ [DIRECTORY_KEY]: directory });
  });
});

describe("rememberPeople", () => {
  it("keeps who someone is but not their state on one pull request", () => {
    expect(
      rememberPeople(EMPTY_DIRECTORY, [found("Mona", { description: "Mona Lisa", requested: true })]),
    ).toEqual({
      people: { mona: { login: "Mona", description: "Mona Lisa", avatarUrl: null, team: false } },
      gone: [],
    });
  });

  it("replaces an older entry with what GitHub shows now", () => {
    const directory = { people: { mona }, gone: [] };

    expect(rememberPeople(directory, [found("mona", { description: "Mona L." })]).people).toEqual({
      mona: { ...mona, description: "Mona L." },
    });
  });

  it("clears the missing mark from anyone GitHub lists again", () => {
    const directory = { people: {}, gone: ["mona", "renamed-person"] };

    expect(rememberPeople(directory, [found("MONA")]).gone).toEqual(["renamed-person"]);
  });
});

describe("markGone", () => {
  it("records each missing login once, regardless of letter case", () => {
    const directory = markGone({ people: {}, gone: ["renamed-person"] }, ["Renamed-Person", "acme/old-team"]);

    expect(directory.gone).toEqual(["renamed-person", "acme/old-team"]);
    expect(isGone(directory, "ACME/old-team")).toBe(true);
    expect(isGone(directory, "mona")).toBe(false);
  });
});

describe("rememberedPeople", () => {
  it("lists everyone remembered as candidates, sorted by login", () => {
    expect(rememberedPeople({ people: { mona, "acme/backend": team }, gone: [] })).toEqual([
      { ...team, requested: false, available: true, reviewState: null },
      { ...mona, requested: false, available: true, reviewState: null },
    ]);
  });
});
