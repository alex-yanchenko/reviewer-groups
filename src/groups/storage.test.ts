import { describe, expect, it, vi } from "vitest";
import type { Group } from "./group";
import {
  GROUP_KEY_PREFIX,
  GROUP_ORDER_KEY,
  LEGACY_GROUPS_KEY,
  loadGroups,
  saveGroups,
  type StorageArea,
} from "./storage";

const backend: Group = { id: "g1", name: "Backend", members: ["mona", "hubot"] };
const frontend: Group = { id: "g2", name: "Frontend", members: ["octocat"] };

const buildArea = (stored: Record<string, unknown>) => {
  const get = vi.fn<StorageArea["get"]>().mockResolvedValueOnce(stored);
  const set = vi.fn<StorageArea["set"]>().mockResolvedValueOnce(undefined);
  const remove = vi.fn<StorageArea["remove"]>().mockResolvedValueOnce(undefined);
  return { area: { get, set, remove } satisfies StorageArea, get, set, remove };
};

describe("loadGroups", () => {
  it("reads each group from its own key, in the saved order", async () => {
    const { area, get } = buildArea({
      [GROUP_ORDER_KEY]: ["g2", "g1"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_KEY_PREFIX}g2`]: frontend,
    });

    expect(await loadGroups(area)).toEqual({ groups: [frontend, backend], unreadable: 0 });
    expect(get).toHaveBeenCalledWith(null);
  });

  it("skips a group it cannot read and counts it, keeping the rest", async () => {
    const { area } = buildArea({
      [GROUP_ORDER_KEY]: ["g1", "broken", "missing"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_KEY_PREFIX}broken`]: { id: "broken", name: "Broken", members: [] },
    });

    expect(await loadGroups(area)).toEqual({ groups: [backend], unreadable: 2 });
  });

  it("reads groups saved by the first version under a single key", async () => {
    const { area } = buildArea({ [LEGACY_GROUPS_KEY]: [backend, { id: "x", name: "", members: [] }] });

    expect(await loadGroups(area)).toEqual({ groups: [backend], unreadable: 1 });
  });

  it("reads an empty store as no groups", async () => {
    const { area } = buildArea({});

    expect(await loadGroups(area)).toEqual({ groups: [], unreadable: 0 });
  });
});

describe("saveGroups", () => {
  it("writes the order and one key per group, then removes keys of deleted groups and the old single key", async () => {
    const { area, set, remove } = buildArea({
      [GROUP_ORDER_KEY]: ["g1", "gone"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_KEY_PREFIX}gone`]: { id: "gone", name: "Gone", members: ["mona"] },
      [LEGACY_GROUPS_KEY]: [backend],
    });

    await saveGroups(area, [backend, frontend]);

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({
      [GROUP_ORDER_KEY]: ["g1", "g2"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_KEY_PREFIX}g2`]: frontend,
    });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([`${GROUP_KEY_PREFIX}gone`, LEGACY_GROUPS_KEY]);
  });

  it("removes nothing when no key is left over", async () => {
    const { area, remove } = buildArea({ [GROUP_ORDER_KEY]: ["g1"], [`${GROUP_KEY_PREFIX}g1`]: backend });

    await saveGroups(area, [backend]);

    expect(remove).not.toHaveBeenCalled();
  });

  it("passes on a write Chrome refuses, such as one over the sync quota", async () => {
    const { area, set } = buildArea({});
    set.mockReset().mockRejectedValueOnce(new Error("QUOTA_BYTES_PER_ITEM quota exceeded"));

    await expect(saveGroups(area, [backend])).rejects.toThrow("QUOTA_BYTES_PER_ITEM quota exceeded");
  });
});
