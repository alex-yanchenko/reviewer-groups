import * as z from "zod/mini";
import type { StorageArea } from "../groups/storage";

export const LAST_ASKED_KEY = "lastAsked";

export type RotationArea = Pick<StorageArea, "get" | "set">;

export interface RotationStore {
  load(): Promise<Record<string, number>>;
  record(logins: string[]): Promise<void>;
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

export const recordAsked = async (area: RotationArea, logins: string[], now: number): Promise<void> => {
  if (logins.length === 0) return;
  const lastAsked = await loadLastAsked(area);
  for (const login of logins) lastAsked[login.toLowerCase()] = now;
  await area.set({ [LAST_ASKED_KEY]: lastAsked });
};

export const rotationStore = (area: RotationArea, now: () => number = Date.now): RotationStore => ({
  load: () => loadLastAsked(area),
  record: (logins) => recordAsked(area, logins, now()),
});
