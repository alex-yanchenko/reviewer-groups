import * as z from "zod/mini";
import { hasOptions, readGroupOptions, readStoredGroup, splitGroupOptions, type Group } from "./group";

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
}

const groupOrderSchema = z.array(z.string());
const legacyGroupsSchema = z.array(z.unknown());

const groupKey = (id: string) => `${GROUP_KEY_PREFIX}${id}`;
const optionsKey = (id: string) => `${GROUP_OPTIONS_KEY_PREFIX}${id}`;

const storedOrder = (stored: Record<string, unknown>): string[] | undefined => {
  const order = groupOrderSchema.safeParse(stored[GROUP_ORDER_KEY]);
  return order.success ? order.data : undefined;
};

const readOrderedGroup = (stored: Record<string, unknown>, id: string): Group | undefined => {
  const group = readStoredGroup(stored[groupKey(id)]);
  return group === undefined ? undefined : { ...group, ...readGroupOptions(stored[optionsKey(id)]) };
};

const readEveryGroup = (stored: Record<string, unknown>): (Group | undefined)[] => {
  const order = storedOrder(stored);
  if (order !== undefined) return order.map((id) => readOrderedGroup(stored, id));
  const legacy = legacyGroupsSchema.safeParse(stored[LEGACY_GROUPS_KEY]);
  return legacy.success ? legacy.data.map(readStoredGroup) : [];
};

export const loadGroups = async (area: StorageArea): Promise<StoredGroups> => {
  const entries = readEveryGroup(await area.get(null));
  const groups = entries.filter((group) => group !== undefined);
  return { groups, unreadable: entries.length - groups.length };
};

const unreadableStoredIds = (stored: Record<string, unknown>, saving: Set<string>): string[] =>
  (storedOrder(stored) ?? []).filter(
    (id) =>
      !saving.has(id) &&
      stored[groupKey(id)] !== undefined &&
      readStoredGroup(stored[groupKey(id)]) === undefined,
  );

const groupItems = (group: Group): [string, unknown][] => {
  const [storedGroup, options] = splitGroupOptions(group);
  const items: [string, unknown][] = [[groupKey(group.id), storedGroup]];
  return hasOptions(options) ? [...items, [optionsKey(group.id), options]] : items;
};

export const saveGroups = async (area: StorageArea, groups: Group[]): Promise<void> => {
  const stored = await area.get(null);
  const saving = new Set(groups.map((group) => group.id));
  const keptIds = [...groups.map((group) => group.id), ...unreadableStoredIds(stored, saving)];
  const items: Record<string, unknown> = {
    [GROUP_ORDER_KEY]: keptIds,
    ...Object.fromEntries(groups.flatMap(groupItems)),
  };
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
