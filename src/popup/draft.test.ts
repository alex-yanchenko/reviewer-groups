import { describe, expect, it, vi } from "vitest";
import { DRAFT_KEY, EMPTY_DRAFT, emptiedDraft, loadDraft, saveDraft, type DraftArea } from "./draft";

const buildArea = (stored: Record<string, unknown>) => {
  const get = vi.fn<DraftArea["get"]>().mockResolvedValueOnce(stored);
  const set = vi.fn<DraftArea["set"]>().mockResolvedValueOnce(undefined);
  return { area: { get, set } satisfies DraftArea, get, set };
};

describe("loadDraft", () => {
  it("returns the ticks saved the last time the dropdown was open", async () => {
    const draft = { selection: ["mona", "acme/backend"], editingGroupId: "g1" };
    const { area, get } = buildArea({ [DRAFT_KEY]: draft });

    expect(await loadDraft(area)).toEqual(draft);
    expect(get).toHaveBeenCalledWith(DRAFT_KEY);
  });

  it("returns who the first run ticked, so the next popup in the session does not tick them again", async () => {
    const draft = { selection: [], editingGroupId: null, firstRunTicked: ["ada-dev"] };
    const { area } = buildArea({ [DRAFT_KEY]: draft });

    expect(await loadDraft(area)).toEqual(draft);
  });

  it("starts empty when nothing was saved", async () => {
    const { area } = buildArea({});

    expect(await loadDraft(area)).toEqual(EMPTY_DRAFT);
  });

  it("starts empty when the saved draft is not readable", async () => {
    const { area } = buildArea({ [DRAFT_KEY]: { selection: "mona" } });

    expect(await loadDraft(area)).toEqual(EMPTY_DRAFT);
  });
});

describe("emptiedDraft", () => {
  it("clears the ticks and the group being edited but keeps who the first run ticked", () => {
    expect(emptiedDraft({ selection: ["mona"], editingGroupId: "g1", firstRunTicked: ["ada-dev"] })).toEqual({
      selection: [],
      editingGroupId: null,
      firstRunTicked: ["ada-dev"],
    });
    expect(emptiedDraft({ selection: ["mona"], editingGroupId: "g1" })).toEqual(EMPTY_DRAFT);
  });
});

describe("saveDraft", () => {
  it("writes the draft under its key", async () => {
    const { area, set } = buildArea({});

    await saveDraft(area, { selection: ["mona"], editingGroupId: null });

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ [DRAFT_KEY]: { selection: ["mona"], editingGroupId: null } });
  });
});
