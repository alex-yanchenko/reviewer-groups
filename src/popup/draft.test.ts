import { describe, expect, it, vi } from "vitest";
import type { GroupsArea } from "../groups/storage";
import { DRAFT_KEY, EMPTY_DRAFT, loadDraft, saveDraft } from "./draft";

const buildArea = (stored: Record<string, unknown>) => {
  const get = vi.fn<GroupsArea["get"]>().mockResolvedValueOnce(stored);
  const set = vi.fn<GroupsArea["set"]>().mockResolvedValueOnce(undefined);
  return { area: { get, set } satisfies GroupsArea, get, set };
};

describe("loadDraft", () => {
  it("returns the ticks saved the last time the dropdown was open", async () => {
    const draft = { selection: ["mona", "acme/backend"], editingGroupId: "g1" };
    const { area, get } = buildArea({ [DRAFT_KEY]: draft });

    expect(await loadDraft(area)).toEqual(draft);
    expect(get).toHaveBeenCalledWith(DRAFT_KEY);
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

describe("saveDraft", () => {
  it("writes the draft under its key", async () => {
    const { area, set } = buildArea({});

    await saveDraft(area, { selection: ["mona"], editingGroupId: null });

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ [DRAFT_KEY]: { selection: ["mona"], editingGroupId: null } });
  });
});
