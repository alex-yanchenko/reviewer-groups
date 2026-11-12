import { describe, expect, it, vi } from "vitest";
import type { ReviewerCandidate } from "../messages";
import {
  DIRECTORY_KEY,
  EMPTY_DIRECTORY,
  isGone,
  loadDirectory,
  markGone,
  rememberPeople,
  rememberedPeople,
  saveDirectory,
  type DirectoryArea,
} from "./directory";

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

const buildArea = (stored: Record<string, unknown>) => {
  const get = vi.fn<DirectoryArea["get"]>().mockResolvedValueOnce(stored);
  const set = vi.fn<DirectoryArea["set"]>().mockResolvedValueOnce(undefined);
  return { area: { get, set } satisfies DirectoryArea, get, set };
};

describe("loadDirectory", () => {
  it("returns the people and missing logins saved before", async () => {
    const saved = { people: { mona, "acme/backend": team }, gone: ["renamed-person"] };
    const { area, get } = buildArea({ [DIRECTORY_KEY]: saved });

    expect(await loadDirectory(area)).toEqual(saved);
    expect(get).toHaveBeenCalledWith(DIRECTORY_KEY);
  });

  it("drops a saved person it cannot read and keeps the rest", async () => {
    const { area } = buildArea({
      [DIRECTORY_KEY]: { people: { mona, broken: { login: 42 } }, gone: [] },
    });

    expect(await loadDirectory(area)).toEqual({ people: { mona }, gone: [] });
  });

  it("drops a saved avatar that is not on GitHub's avatar host", async () => {
    const { area } = buildArea({
      [DIRECTORY_KEY]: { people: { mona: { ...mona, avatarUrl: "https://tracker.test/p.png" } }, gone: [] },
    });

    expect(await loadDirectory(area)).toEqual({ people: { mona }, gone: [] });
  });

  it("starts empty when nothing was saved or the saved value is not a directory", async () => {
    expect(await loadDirectory(buildArea({}).area)).toEqual(EMPTY_DIRECTORY);
    expect(await loadDirectory(buildArea({ [DIRECTORY_KEY]: "nonsense" }).area)).toEqual(EMPTY_DIRECTORY);
  });
});

describe("saveDirectory", () => {
  it("writes the directory under its key", async () => {
    const { area, set } = buildArea({});
    const directory = { people: { mona }, gone: ["renamed-person"] };

    await saveDirectory(area, directory);

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ [DIRECTORY_KEY]: directory });
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
