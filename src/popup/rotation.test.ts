import { describe, expect, it, vi } from "vitest";
import { LAST_ASKED_KEY, loadLastAsked, recordAsked, restoreAsked, type RotationArea } from "./rotation";

const buildArea = (stored: Record<string, unknown>) => {
  const get = vi.fn<RotationArea["get"]>().mockResolvedValue(stored);
  const set = vi.fn<RotationArea["set"]>().mockResolvedValue(undefined);
  return { area: { get, set } satisfies RotationArea, set };
};

describe("loadLastAsked", () => {
  it("reads when each person was last asked, keeping only readable times", async () => {
    const { area } = buildArea({ [LAST_ASKED_KEY]: { "ada-dev": 100, "grace-ops": "yesterday" } });

    expect(await loadLastAsked(area)).toEqual({ "ada-dev": 100 });
  });

  it("reads nothing stored as nobody asked yet", async () => {
    const { area } = buildArea({});

    expect(await loadLastAsked(area)).toEqual({});
  });
});

describe("recordAsked", () => {
  it("stamps the people just requested with the time, keeping everyone else", async () => {
    const { area, set } = buildArea({ [LAST_ASKED_KEY]: { "ada-dev": 100, "grace-ops": 200 } });

    await recordAsked(area, ["Grace-Ops", "linus-qa"], 900);

    expect(set).toHaveBeenCalledWith({
      [LAST_ASKED_KEY]: { "ada-dev": 100, "grace-ops": 900, "linus-qa": 900 },
    });
  });

  it("writes nothing when nobody was requested", async () => {
    const { area, set } = buildArea({});

    await recordAsked(area, [], 900);

    expect(set).not.toHaveBeenCalled();
  });

  it("answers with when each person was last asked before, and null for someone never asked", async () => {
    const { area } = buildArea({ [LAST_ASKED_KEY]: { "ada-dev": 100 } });

    expect(await recordAsked(area, ["Ada-Dev", "linus-qa"], 900)).toEqual({
      "ada-dev": 100,
      "linus-qa": null,
    });
  });
});

describe("restoreAsked", () => {
  it("puts back the earlier time of each person and forgets someone who had never been asked", async () => {
    const { area, set } = buildArea({
      [LAST_ASKED_KEY]: { "ada-dev": 900, "grace-ops": 800, "linus-qa": 900 },
    });

    await restoreAsked(area, { "ada-dev": 100, "linus-qa": null });

    expect(set).toHaveBeenCalledWith({ [LAST_ASKED_KEY]: { "ada-dev": 100, "grace-ops": 800 } });
  });

  it("writes nothing when there is nothing to restore", async () => {
    const { area, set } = buildArea({});

    await restoreAsked(area, {});

    expect(set).not.toHaveBeenCalled();
  });
});
