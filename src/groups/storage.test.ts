import { describe, expect, it, vi } from "vitest";
import type { Group } from "./group";
import {
  GROUP_KEY_PREFIX,
  GROUP_OPTIONS_KEY_PREFIX,
  GROUP_ORDER_KEY,
  LEGACY_GROUPS_KEY,
  loadGroups,
  saveGroups,
  SyncQuotaError,
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

  it("adds each group's options from its own options key", async () => {
    const { area } = buildArea({
      [GROUP_ORDER_KEY]: ["g1", "g2"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_OPTIONS_KEY_PREFIX}g1`]: { repos: ["acme/widgets"], ask: 1 },
      [`${GROUP_KEY_PREFIX}g2`]: frontend,
    });

    expect(await loadGroups(area)).toEqual({
      groups: [{ ...backend, repos: ["acme/widgets"], ask: 1 }, frontend],
      unreadable: 0,
    });
  });

  it("keeps a group whose options cannot be read, leaving out only those options", async () => {
    const { area } = buildArea({
      [GROUP_ORDER_KEY]: ["g1"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_OPTIONS_KEY_PREFIX}g1`]: { repos: "acme/widgets", ask: 0 },
    });

    expect(await loadGroups(area)).toEqual({ groups: [backend], unreadable: 0 });
  });
});

describe("group options across releases", () => {
  const inMemoryArea = (initial: Record<string, unknown>) => {
    const store = { ...initial };
    const area: StorageArea = {
      get: () => Promise.resolve({ ...store }),
      set: (items) => {
        Object.assign(store, items);
        return Promise.resolve();
      },
      remove: (keys) => {
        for (const key of keys) Reflect.deleteProperty(store, key);
        return Promise.resolve();
      },
    };
    return { area, store };
  };

  const saveLikeTheFirstRelease = (store: Record<string, unknown>, groups: Group[]) => {
    const keptKeys = groups.map((group) => `${GROUP_KEY_PREFIX}${group.id}`);
    for (const key of Object.keys(store)) {
      if (key.startsWith(GROUP_KEY_PREFIX) && !keptKeys.includes(key)) Reflect.deleteProperty(store, key);
    }
    Reflect.deleteProperty(store, LEGACY_GROUPS_KEY);
    store[GROUP_ORDER_KEY] = groups.map((group) => group.id);
    for (const { id, name, members } of groups) store[`${GROUP_KEY_PREFIX}${id}`] = { id, name, members };
  };

  const laterVersionOptions = { repos: ["acme/*"], ask: 2, muted: true, schedule: { days: ["mon"] } };

  it("keeps a later version's options through a save by the first release and a save by this one", async () => {
    const { area, store } = inMemoryArea({
      [GROUP_ORDER_KEY]: ["g1"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_OPTIONS_KEY_PREFIX}g1`]: laterVersionOptions,
    });

    saveLikeTheFirstRelease(store, [{ ...backend, name: "Backend team" }]);
    const { groups } = await loadGroups(area);
    await saveGroups(area, groups);

    expect(store[`${GROUP_OPTIONS_KEY_PREFIX}g1`]).toEqual(laterVersionOptions);
    expect(groups).toEqual([{ ...backend, name: "Backend team", repos: ["acme/*"], ask: 2 }]);
  });

  it("keeps an option value it cannot read untouched when the group is saved", async () => {
    const stored = { repos: ["acme/*"], ask: "every-other-day" };
    const { area, store } = inMemoryArea({
      [GROUP_ORDER_KEY]: ["g1"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_OPTIONS_KEY_PREFIX}g1`]: stored,
    });

    const { groups } = await loadGroups(area);
    await saveGroups(
      area,
      groups.map((group) => ({ ...group, name: "Backend team" })),
    );

    expect(store[`${GROUP_OPTIONS_KEY_PREFIX}g1`]).toEqual(stored);
  });

  it("keeps a repo list's unreadable entries while its readable ones are unchanged", async () => {
    const stored = { repos: ["acme/*", { glob: "acme/**" }] };
    const { area, store } = inMemoryArea({
      [GROUP_ORDER_KEY]: ["g1"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_OPTIONS_KEY_PREFIX}g1`]: stored,
    });

    const { groups } = await loadGroups(area);
    await saveGroups(area, groups);

    expect(store[`${GROUP_OPTIONS_KEY_PREFIX}g1`]).toEqual(stored);
  });

  it("still lets a person change and clear the options they can see", async () => {
    const { area, store } = inMemoryArea({
      [GROUP_ORDER_KEY]: ["g1"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_OPTIONS_KEY_PREFIX}g1`]: laterVersionOptions,
    });

    await saveGroups(area, [{ ...backend, ask: 3 }]);

    expect(store[`${GROUP_OPTIONS_KEY_PREFIX}g1`]).toEqual({
      ask: 3,
      muted: true,
      schedule: { days: ["mon"] },
    });
  });

  it("removes the options key once nothing is left in it", async () => {
    const { area, store } = inMemoryArea({
      [GROUP_ORDER_KEY]: ["g1"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_OPTIONS_KEY_PREFIX}g1`]: { ask: 2 },
    });

    await saveGroups(area, [backend]);

    expect(`${GROUP_OPTIONS_KEY_PREFIX}g1` in store).toBe(false);
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

  it("writes each group's options under their own key and the group without them", async () => {
    const { area, set } = buildArea({});

    await saveGroups(area, [{ ...backend, repos: ["acme/*"], ask: 2 }, frontend]);

    expect(set).toHaveBeenCalledWith({
      [GROUP_ORDER_KEY]: ["g1", "g2"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_OPTIONS_KEY_PREFIX}g1`]: { repos: ["acme/*"], ask: 2 },
      [`${GROUP_KEY_PREFIX}g2`]: frontend,
    });
  });

  it("removes the options of a deleted group and of a group that no longer has any", async () => {
    const { area, remove } = buildArea({
      [GROUP_ORDER_KEY]: ["g1", "g2"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_OPTIONS_KEY_PREFIX}g1`]: { ask: 1 },
      [`${GROUP_KEY_PREFIX}g2`]: frontend,
      [`${GROUP_OPTIONS_KEY_PREFIX}g2`]: { ask: 1 },
    });

    await saveGroups(area, [backend]);

    expect(remove).toHaveBeenCalledWith([
      `${GROUP_OPTIONS_KEY_PREFIX}g1`,
      `${GROUP_KEY_PREFIX}g2`,
      `${GROUP_OPTIONS_KEY_PREFIX}g2`,
    ]);
  });

  it("keeps a stored group it cannot read, with its options, instead of deleting it", async () => {
    const fromLaterVersion = { id: "later", name: "Later", members: [], everyoneInOrg: true };
    const { area, set, remove } = buildArea({
      [GROUP_ORDER_KEY]: ["later", "g1", "missing"],
      [`${GROUP_KEY_PREFIX}later`]: fromLaterVersion,
      [`${GROUP_OPTIONS_KEY_PREFIX}later`]: { ask: 1 },
      [`${GROUP_KEY_PREFIX}g1`]: backend,
    });

    await saveGroups(area, [backend, frontend]);

    expect(set).toHaveBeenCalledWith({
      [GROUP_ORDER_KEY]: ["g1", "g2", "later"],
      [`${GROUP_KEY_PREFIX}g1`]: backend,
      [`${GROUP_KEY_PREFIX}g2`]: frontend,
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuses a save over Chrome's sync quota before writing anything", async () => {
    const crowd = Array.from({ length: 60 }, (_, index) => ({
      id: `g${index}`,
      name: `Group ${index}`,
      members: Array.from({ length: 100 }, (_, member) => `member-number-${index}-${member}`),
    }));
    const { area, set, remove } = buildArea({});

    await expect(saveGroups(area, crowd)).rejects.toThrow(SyncQuotaError);
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuses a group too large for one sync item before writing anything", async () => {
    const huge = {
      id: "g1",
      name: "Everyone",
      members: Array.from({ length: 500 }, (_, member) => `member-number-${member}`),
    };
    const { area, set } = buildArea({});

    await expect(saveGroups(area, [huge])).rejects.toThrow(
      'The group "Everyone" is too large for one Chrome sync item.',
    );
    expect(set).not.toHaveBeenCalled();
  });

  it("counts what is already stored toward the sync quota", async () => {
    const { area, set } = buildArea({ unrelated: "x".repeat(102_350) });

    await expect(saveGroups(area, [backend])).rejects.toThrow(SyncQuotaError);
    expect(set).not.toHaveBeenCalled();
  });

  it("passes on a write Chrome refuses, such as one over the sync quota", async () => {
    const { area, set } = buildArea({});
    set.mockReset().mockRejectedValueOnce(new Error("QUOTA_BYTES_PER_ITEM quota exceeded"));

    await expect(saveGroups(area, [backend])).rejects.toThrow("QUOTA_BYTES_PER_ITEM quota exceeded");
  });
});
