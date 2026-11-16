import { describe, expect, it, vi } from "vitest";
import { LAST_ASKED_KEY, loadLastAsked, recordAsked, type RotationArea } from "./rotation";

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
});
