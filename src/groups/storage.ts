import * as z from "zod/mini";
import { mergeGroupOptions, readGroupOptions, readStoredGroup, splitGroupOptions, type Group } from "./group";

export const GROUP_ORDER_KEY = "groupOrder";
export const GROUP_KEY_PREFIX = "group:";
export const GROUP_OPTIONS_KEY_PREFIX = "groupOptions:";
export const LEGACY_GROUPS_KEY = "groups";

export interface StorageArea {
  get(keys: string | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export interface StoredGroups {
  groups: Group[];
  unreadable: number;
  unreadableNames: string[];
}

const groupOrderSchema = z.array(z.string());
const legacyGroupsSchema = z.array(z.unknown());

const groupKey = (id: string) => `${GROUP_KEY_PREFIX}${id}`;
const optionsKey = (id: string) => `${GROUP_OPTIONS_KEY_PREFIX}${id}`;

const storedOrder = (stored: Record<string, unknown>): string[] | undefined => {
  const order = groupOrderSchema.safeParse(stored[GROUP_ORDER_KEY]);
  return order.success ? order.data : undefined;
};

type ReadEntry = { group: Group } | { unreadableName: string };

const nameOfUnreadable = (raw: unknown, fallback: string): string => {
  const named = z.object({ name: z.string().check(z.trim(), z.minLength(1)) }).safeParse(raw);
  return named.success ? named.data.name : fallback;
};

const readOrderedGroup = (stored: Record<string, unknown>, id: string): ReadEntry => {
  const raw = stored[groupKey(id)];
  const group = readStoredGroup(raw);
  return group === undefined
    ? { unreadableName: nameOfUnreadable(raw, id) }
    : { group: { ...group, ...readGroupOptions(stored[optionsKey(id)]) } };
};

const readLegacyGroup = (raw: unknown, index: number): ReadEntry => {
  const group = readStoredGroup(raw);
  return group === undefined ? { unreadableName: nameOfUnreadable(raw, `group ${index + 1}`) } : { group };
};

const readEveryGroup = (stored: Record<string, unknown>): ReadEntry[] => {
  const order = storedOrder(stored);
  if (order !== undefined) return order.map((id) => readOrderedGroup(stored, id));
  const legacy = legacyGroupsSchema.safeParse(stored[LEGACY_GROUPS_KEY]);
  return legacy.success ? legacy.data.map(readLegacyGroup) : [];
};

export const loadGroups = async (area: StorageArea): Promise<StoredGroups> => {
  const entries = readEveryGroup(await area.get(null));
  const groups = entries.flatMap((entry) => ("group" in entry ? [entry.group] : []));
  const unreadableNames = entries.flatMap((entry) =>
    "unreadableName" in entry ? [entry.unreadableName] : [],
  );
  return { groups, unreadable: unreadableNames.length, unreadableNames };
};

const unreadableStoredIds = (stored: Record<string, unknown>, saving: Set<string>): string[] =>
  (storedOrder(stored) ?? []).filter(
    (id) =>
      !saving.has(id) &&
      stored[groupKey(id)] !== undefined &&
      readStoredGroup(stored[groupKey(id)]) === undefined,
  );

const groupItems = (group: Group, stored: Record<string, unknown>): [string, unknown][] => {
  const [storedGroup, options] = splitGroupOptions(group);
  const items: [string, unknown][] = [[groupKey(group.id), storedGroup]];
  const mergedOptions = mergeGroupOptions(stored[optionsKey(group.id)], options);
  return Object.keys(mergedOptions).length > 0 ? [...items, [optionsKey(group.id), mergedOptions]] : items;
};

const SYNC_QUOTA_BYTES = 102_400;
const SYNC_QUOTA_BYTES_PER_ITEM = 8_192;
const SYNC_MAX_ITEMS = 512;
const BYTES_PER_KB = 1_024;

export class SyncQuotaError extends Error {
  override readonly name = "SyncQuotaError";
  constructor(bytes: number) {
    super(
      `These groups need ${Math.ceil(bytes / BYTES_PER_KB)} KB of Chrome sync storage, which holds ${SYNC_QUOTA_BYTES / BYTES_PER_KB} KB.`,
    );
  }
}

export class SyncItemCountError extends Error {
  override readonly name = "SyncItemCountError";
  constructor() {
    super(`These groups need more than the ${SYNC_MAX_ITEMS} items Chrome sync storage holds.`);
  }
}

export class SyncItemTooLargeError extends Error {
  override readonly name = "SyncItemTooLargeError";
  constructor(groupName: string) {
    super(`The group "${groupName}" is too large for one Chrome sync item.`);
  }
}

const itemBytes = (key: string, value: unknown): number =>
  new TextEncoder().encode(key + JSON.stringify(value)).length;

const checkSyncQuota = (stored: Record<string, unknown>, items: Record<string, unknown>, groups: Group[]) => {
  for (const group of groups) {
    for (const [key, value] of groupItems(group, stored)) {
      if (itemBytes(key, value) > SYNC_QUOTA_BYTES_PER_ITEM) throw new SyncItemTooLargeError(group.name);
    }
  }
  const afterWrite = { ...stored, ...items };
  if (Object.keys(afterWrite).length > SYNC_MAX_ITEMS) throw new SyncItemCountError();
  const bytes = Object.entries(afterWrite).reduce((total, [key, value]) => total + itemBytes(key, value), 0);
  if (bytes > SYNC_QUOTA_BYTES) throw new SyncQuotaError(bytes);
};

export const saveGroups = async (area: StorageArea, groups: Group[]): Promise<void> => {
  const stored = await area.get(null);
  const saving = new Set(groups.map((group) => group.id));
  const keptIds = [...groups.map((group) => group.id), ...unreadableStoredIds(stored, saving)];
  const items: Record<string, unknown> = {
    [GROUP_ORDER_KEY]: keptIds,
    ...Object.fromEntries(groups.flatMap((group) => groupItems(group, stored))),
  };
  checkSyncQuota(stored, items, groups);
  await area.set(items);
  const keptKeys = new Set([
    ...Object.keys(items),
    ...keptIds.filter((id) => !saving.has(id)).flatMap((id) => [groupKey(id), optionsKey(id)]),
  ]);
  const leftOver = Object.keys(stored).filter(
    (key) =>
      ((key.startsWith(GROUP_KEY_PREFIX) || key.startsWith(GROUP_OPTIONS_KEY_PREFIX)) &&
        !keptKeys.has(key)) ||
      key === LEGACY_GROUPS_KEY,
  );
  if (leftOver.length > 0) await area.remove(leftOver);
};
