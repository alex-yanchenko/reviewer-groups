import { parseStoredGroups, type Group } from "./group";

export const GROUPS_KEY = "groups";

export interface GroupsArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const loadGroups = async (area: GroupsArea): Promise<Group[]> => {
  const stored = await area.get(GROUPS_KEY);
  return parseStoredGroups(stored[GROUPS_KEY]);
};

export const saveGroups = (area: GroupsArea, groups: Group[]): Promise<void> =>
  area.set({ [GROUPS_KEY]: groups });

export const watchGroups = (onChange: (groups: Group[]) => void): (() => void) => {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    const change = changes[GROUPS_KEY];
    if (areaName !== "sync" || change === undefined) return;
    onChange(parseStoredGroups(change.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
};
