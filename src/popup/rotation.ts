import * as z from "zod/mini";
import type { StoredItem } from "./storedItems";

export type AskedBefore = Record<string, number | null>;

export interface RotationStore {
  load(): Promise<Record<string, number>>;
  record(logins: string[]): Promise<AskedBefore>;
  restore(before: AskedBefore): Promise<void>;
}

const storedTimesSchema = z.record(z.string(), z.unknown());
const timeSchema = z.number();

export const loadLastAsked = async (item: StoredItem): Promise<Record<string, number>> => {
  const stored = storedTimesSchema.safeParse(await item.getValue());
  if (!stored.success) return {};
  return Object.fromEntries(
    Object.entries(stored.data).flatMap(([login, raw]) => {
      const time = timeSchema.safeParse(raw);
      return time.success ? [[login.toLowerCase(), time.data]] : [];
    }),
  );
};

export const recordAsked = async (item: StoredItem, logins: string[], now: number): Promise<AskedBefore> => {
  if (logins.length === 0) return {};
  const lastAsked = await loadLastAsked(item);
  const before: AskedBefore = {};
  for (const login of logins) {
    const key = login.toLowerCase();
    before[key] = lastAsked[key] ?? null;
    lastAsked[key] = now;
  }
  await item.setValue(lastAsked);
  return before;
};

export const restoreAsked = async (item: StoredItem, before: AskedBefore): Promise<void> => {
  const restoring = Object.entries(before);
  if (restoring.length === 0) return;
  const lastAsked = await loadLastAsked(item);
  for (const [login, time] of restoring) {
    if (time === null) Reflect.deleteProperty(lastAsked, login);
    else lastAsked[login] = time;
  }
  await item.setValue(lastAsked);
};

export const rotationStore = (item: StoredItem, now: () => number = Date.now): RotationStore => ({
  load: () => loadLastAsked(item),
  record: (logins) => recordAsked(item, logins, now()),
  restore: (before) => restoreAsked(item, before),
});
