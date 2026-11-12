import * as z from "zod/mini";
import { readStoredGroup, type Group } from "./group";

export const GROUP_ORDER_KEY = "groupOrder";
export const GROUP_KEY_PREFIX = "group:";
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

const storedEntries = (stored: Record<string, unknown>): unknown[] => {
  const order = groupOrderSchema.safeParse(stored[GROUP_ORDER_KEY]);
  if (order.success) return order.data.map((id) => stored[groupKey(id)]);
  const legacy = legacyGroupsSchema.safeParse(stored[LEGACY_GROUPS_KEY]);
  return legacy.success ? legacy.data : [];
};

export const loadGroups = async (area: StorageArea): Promise<StoredGroups> => {
  const entries = storedEntries(await area.get(null));
  const groups = entries.flatMap((entry) => readStoredGroup(entry) ?? []);
  return { groups, unreadable: entries.length - groups.length };
};

export const saveGroups = async (area: StorageArea, groups: Group[]): Promise<void> => {
  const stored = await area.get(null);
  const keptKeys = new Set(groups.map((group) => groupKey(group.id)));
  await area.set({
    [GROUP_ORDER_KEY]: groups.map((group) => group.id),
    ...Object.fromEntries(groups.map((group) => [groupKey(group.id), group])),
  });
  const leftOver = Object.keys(stored).filter(
    (key) => (key.startsWith(GROUP_KEY_PREFIX) && !keptKeys.has(key)) || key === LEGACY_GROUPS_KEY,
  );
  if (leftOver.length > 0) await area.remove(leftOver);
};
