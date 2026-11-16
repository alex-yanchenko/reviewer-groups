import * as z from "zod/mini";
import { memberSchema } from "../groups/group";
import type { StoredItem } from "./storedItems";

const draftSchema = z.object({
  selection: z.array(memberSchema),
  editingGroupId: z.nullable(z.string()),
  firstRunTicked: z.optional(z.object({ pullRequest: z.string(), logins: z.array(memberSchema) })),
});

export type Draft = z.infer<typeof draftSchema>;

export const EMPTY_DRAFT: Draft = { selection: [], editingGroupId: null };

export const emptiedDraft = ({ firstRunTicked }: Draft): Draft => ({
  ...EMPTY_DRAFT,
  ...(firstRunTicked === undefined ? {} : { firstRunTicked }),
});

export const loadDraft = async (item: StoredItem): Promise<Draft> => {
  const result = draftSchema.safeParse(await item.getValue());
  return result.success ? result.data : EMPTY_DRAFT;
};

export const saveDraft = (item: StoredItem, draft: Draft): Promise<void> => item.setValue(draft);
