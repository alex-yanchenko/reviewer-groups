import { describe, expect, it, vi } from "vitest";
import type { Group } from "./group";
import { GROUPS_KEY, loadGroups, saveGroups, type GroupsArea } from "./storage";

const backend: Group = {
  id: "3b0e6f0a-8f43-4a43-9a43-0d9c5e1f2a10",
  name: "Backend",
  members: ["mona", "hubot"],
};

const buildArea = (stored: Record<string, unknown>) => {
  const get = vi.fn<GroupsArea["get"]>().mockResolvedValueOnce(stored);
  const set = vi.fn<GroupsArea["set"]>().mockResolvedValueOnce(undefined);
  return { area: { get, set } satisfies GroupsArea, get, set };
};

describe("loadGroups", () => {
  it("reads the groups key and parses it", async () => {
    const { area, get } = buildArea({ [GROUPS_KEY]: [backend] });

    expect(await loadGroups(area)).toEqual([backend]);
    expect(get).toHaveBeenCalledWith(GROUPS_KEY);
  });

  it("reads an empty store as no groups", async () => {
    const { area } = buildArea({});

    expect(await loadGroups(area)).toEqual([]);
  });
});

describe("saveGroups", () => {
  it("writes every group under the groups key", async () => {
    const { area, set } = buildArea({});

    await saveGroups(area, [backend]);

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ [GROUPS_KEY]: [backend] });
  });
});
