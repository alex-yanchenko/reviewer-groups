import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { loadDirectory, saveDirectory } from "./directory";
import { loadDraft, saveDraft } from "./draft";
import { loadLastAsked, recordAsked } from "./rotation";
import { directoryItem, draftItem, lastAskedItem } from "./storedItems";

const draftWrittenBy110 = {
  selection: ["ada-dev", "acme/backend"],
  editingGroupId: "g1",
  firstRunTicked: { pullRequest: "acme/widgets#7", logins: ["ada-dev"] },
};

const directoryWrittenBy110 = {
  people: {
    "ada-dev": {
      login: "Ada-Dev",
      description: "Ada Dev",
      avatarUrl: "https://avatars.githubusercontent.com/u/201",
      team: false,
    },
    "acme/backend": { login: "acme/backend", description: "API owners", avatarUrl: null, team: true },
  },
  gone: ["renamed-person"],
};

const lastAskedWrittenBy110 = { "ada-dev": 1_700_000_000_000 };

beforeEach(async () => {
  fakeBrowser.reset();
  await fakeBrowser.storage.session.set({ draft: draftWrittenBy110 });
  await fakeBrowser.storage.local.set({ directory: directoryWrittenBy110, lastAsked: lastAskedWrittenBy110 });
});

describe("values stored by version 1.1.0", () => {
  it("reads the session ticks, the remembered people and when each person was last asked", async () => {
    expect(await loadDraft(draftItem)).toEqual(draftWrittenBy110);
    expect(await loadDirectory(directoryItem)).toEqual(directoryWrittenBy110);
    expect(await loadLastAsked(lastAskedItem)).toEqual(lastAskedWrittenBy110);
  });

  it("writes them back under the same keys and in the same shape, with nothing beside them", async () => {
    await saveDraft(draftItem, { ...draftWrittenBy110, selection: ["ada-dev"] });
    await saveDirectory(directoryItem, { ...directoryWrittenBy110, gone: [] });
    await recordAsked(lastAskedItem, ["grace-ops"], 1_700_000_000_500);

    expect(await fakeBrowser.storage.session.get(null)).toEqual({
      draft: { ...draftWrittenBy110, selection: ["ada-dev"] },
    });
    expect(await fakeBrowser.storage.local.get(null)).toEqual({
      directory: { ...directoryWrittenBy110, gone: [] },
      lastAsked: { "ada-dev": 1_700_000_000_000, "grace-ops": 1_700_000_000_500 },
    });
  });
});
