import { storage, type WxtStorageItem } from "@wxt-dev/storage";

export type StoredItem = Pick<WxtStorageItem<unknown, Record<string, unknown>>, "getValue" | "setValue">;

export const DRAFT_KEY = "draft";
export const DIRECTORY_KEY = "directory";
export const LAST_ASKED_KEY = "lastAsked";

export const draftItem: StoredItem = storage.defineItem<unknown>(`session:${DRAFT_KEY}`);
export const directoryItem: StoredItem = storage.defineItem<unknown>(`local:${DIRECTORY_KEY}`);
export const lastAskedItem: StoredItem = storage.defineItem<unknown>(`local:${LAST_ASKED_KEY}`);
