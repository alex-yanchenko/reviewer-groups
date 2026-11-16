import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { EMPTY_DRAFT, emptiedDraft, loadDraft, saveDraft } from "./draft";
import { DRAFT_KEY, draftItem } from "./storedItems";

beforeEach(() => {
  fakeBrowser.reset();
});

const storeDraft = (draft: unknown) => fakeBrowser.storage.session.set({ [DRAFT_KEY]: draft });

describe("loadDraft", () => {
  it("returns the ticks saved the last time the dropdown was open", async () => {
    const draft = { selection: ["mona", "acme/backend"], editingGroupId: "g1" };
    await storeDraft(draft);

    expect(await loadDraft(draftItem)).toEqual(draft);
  });

  it("returns who the first run ticked, so the next popup in the session does not tick them again", async () => {
    const draft = {
      selection: [],
      editingGroupId: null,
      firstRunTicked: { pullRequest: "acme/widgets#7", logins: ["ada-dev"] },
    };
    await storeDraft(draft);

    expect(await loadDraft(draftItem)).toEqual(draft);
  });

  it("starts empty when nothing was saved", async () => {
    expect(await loadDraft(draftItem)).toEqual(EMPTY_DRAFT);
  });

  it("starts empty when the saved draft is not readable", async () => {
    await storeDraft({ selection: "mona" });

    expect(await loadDraft(draftItem)).toEqual(EMPTY_DRAFT);
  });
});

describe("emptiedDraft", () => {
  it("clears the ticks and the group being edited but keeps who the first run ticked", () => {
    const firstRunTicked = { pullRequest: "acme/widgets#7", logins: ["ada-dev"] };

    expect(emptiedDraft({ selection: ["mona"], editingGroupId: "g1", firstRunTicked })).toEqual({
      selection: [],
      editingGroupId: null,
      firstRunTicked,
    });
    expect(emptiedDraft({ selection: ["mona"], editingGroupId: "g1" })).toEqual(EMPTY_DRAFT);
  });
});

describe("saveDraft", () => {
  it("writes the draft under its key", async () => {
    await saveDraft(draftItem, { selection: ["mona"], editingGroupId: null });

    expect(await fakeBrowser.storage.session.get(null)).toEqual({
      [DRAFT_KEY]: { selection: ["mona"], editingGroupId: null },
    });
  });
});
