import * as z from "zod/mini";
import { memberSchema } from "../groups/group";
import type { StorageArea } from "../groups/storage";

export type DraftArea = Pick<StorageArea, "get" | "set">;

export const DRAFT_KEY = "draft";

const draftSchema = z.object({
  selection: z.array(memberSchema),
  editingGroupId: z.nullable(z.string()),
});

export type Draft = z.infer<typeof draftSchema>;

export const EMPTY_DRAFT: Draft = { selection: [], editingGroupId: null };

export const loadDraft = async (area: DraftArea): Promise<Draft> => {
  const stored = await area.get(DRAFT_KEY);
  const result = draftSchema.safeParse(stored[DRAFT_KEY]);
  return result.success ? result.data : EMPTY_DRAFT;
};

export const saveDraft = (area: DraftArea, draft: Draft): Promise<void> => area.set({ [DRAFT_KEY]: draft });
