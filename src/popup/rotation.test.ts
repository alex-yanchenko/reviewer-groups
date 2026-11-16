import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { loadLastAsked, recordAsked, restoreAsked } from "./rotation";
import { LAST_ASKED_KEY, lastAskedItem } from "./storedItems";

beforeEach(() => {
  fakeBrowser.reset();
});

const storeLastAsked = (lastAsked: unknown) => fakeBrowser.storage.local.set({ [LAST_ASKED_KEY]: lastAsked });

const everythingStored = () => fakeBrowser.storage.local.get(null);

describe("loadLastAsked", () => {
  it("reads when each person was last asked, keeping only readable times", async () => {
    await storeLastAsked({ "ada-dev": 100, "grace-ops": "yesterday" });

    expect(await loadLastAsked(lastAskedItem)).toEqual({ "ada-dev": 100 });
  });

  it("reads nothing stored as nobody asked yet", async () => {
    expect(await loadLastAsked(lastAskedItem)).toEqual({});
  });
});

describe("recordAsked", () => {
  it("stamps the people just requested with the time, keeping everyone else", async () => {
    await storeLastAsked({ "ada-dev": 100, "grace-ops": 200 });

    await recordAsked(lastAskedItem, ["Grace-Ops", "linus-qa"], 900);

    expect(await everythingStored()).toEqual({
      [LAST_ASKED_KEY]: { "ada-dev": 100, "grace-ops": 900, "linus-qa": 900 },
    });
  });

  it("writes nothing when nobody was requested", async () => {
    await recordAsked(lastAskedItem, [], 900);

    expect(await everythingStored()).toEqual({});
  });

  it("answers with when each person was last asked before, and null for someone never asked", async () => {
    await storeLastAsked({ "ada-dev": 100 });

    expect(await recordAsked(lastAskedItem, ["Ada-Dev", "linus-qa"], 900)).toEqual({
      "ada-dev": 100,
      "linus-qa": null,
    });
  });
});

describe("restoreAsked", () => {
  it("puts back the earlier time of each person and forgets someone who had never been asked", async () => {
    await storeLastAsked({ "ada-dev": 900, "grace-ops": 800, "linus-qa": 900 });

    await restoreAsked(lastAskedItem, { "ada-dev": 100, "linus-qa": null });

    expect(await everythingStored()).toEqual({ [LAST_ASKED_KEY]: { "ada-dev": 100, "grace-ops": 800 } });
  });

  it("writes nothing when there is nothing to restore", async () => {
    await restoreAsked(lastAskedItem, {});

    expect(await everythingStored()).toEqual({});
  });
});
