import * as z from "zod/mini";
import type { StorageArea } from "../groups/storage";

export const LAST_ASKED_KEY = "lastAsked";

export type RotationArea = Pick<StorageArea, "get" | "set">;

export type AskedBefore = Record<string, number | null>;

export interface RotationStore {
  load(): Promise<Record<string, number>>;
  record(logins: string[]): Promise<AskedBefore>;
  restore(before: AskedBefore): Promise<void>;
}

const storedTimesSchema = z.record(z.string(), z.unknown());
const timeSchema = z.number();

export const loadLastAsked = async (area: RotationArea): Promise<Record<string, number>> => {
  const stored = storedTimesSchema.safeParse((await area.get(LAST_ASKED_KEY))[LAST_ASKED_KEY]);
  if (!stored.success) return {};
  return Object.fromEntries(
    Object.entries(stored.data).flatMap(([login, raw]) => {
      const time = timeSchema.safeParse(raw);
      return time.success ? [[login.toLowerCase(), time.data]] : [];
    }),
  );
};

export const recordAsked = async (
  area: RotationArea,
  logins: string[],
  now: number,
): Promise<AskedBefore> => {
  if (logins.length === 0) return {};
  const lastAsked = await loadLastAsked(area);
  const before: AskedBefore = {};
  for (const login of logins) {
    const key = login.toLowerCase();
    before[key] = lastAsked[key] ?? null;
    lastAsked[key] = now;
  }
  await area.set({ [LAST_ASKED_KEY]: lastAsked });
  return before;
};

export const restoreAsked = async (area: RotationArea, before: AskedBefore): Promise<void> => {
  const restoring = Object.entries(before);
  if (restoring.length === 0) return;
  const lastAsked = await loadLastAsked(area);
  for (const [login, time] of restoring) {
    if (time === null) Reflect.deleteProperty(lastAsked, login);
    else lastAsked[login] = time;
  }
  await area.set({ [LAST_ASKED_KEY]: lastAsked });
};

export const rotationStore = (area: RotationArea, now: () => number = Date.now): RotationStore => ({
  load: () => loadLastAsked(area),
  record: (logins) => recordAsked(area, logins, now()),
  restore: (before) => restoreAsked(area, before),
});
