import * as z from "zod/mini";
import { askSchema, memberSchema, type Group } from "./group";
import { repoPatternSchema } from "./repoPatterns";

export const GROUP_FILE_NAME = "groups.json";

const GROUP_FILE_VERSION = 1;

const groupFileSchema = z.object({ version: z.int(), groups: z.array(z.unknown()) });

const importedGroupSchema = z.looseObject({
  id: z.optional(z.string()),
  name: z.string().check(z.trim(), z.minLength(1), z.maxLength(60)),
  members: z.array(memberSchema).check(z.minLength(1)),
  repos: z.optional(z.array(repoPatternSchema)),
  ask: z.optional(askSchema),
});

export type ImportedGroup = z.infer<typeof importedGroupSchema>;

export type GroupFileReading = { ok: true; groups: ImportedGroup[] } | { ok: false; error: string };

export const exportGroups = (groups: Group[]): string =>
  JSON.stringify({ version: GROUP_FILE_VERSION, groups }, null, 2);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

export const readGroupFile = (text: string): GroupFileReading => {
  const json = parseJson(text);
  if (json === undefined) return { ok: false, error: "This file is not JSON." };
  const file = groupFileSchema.safeParse(json);
  if (!file.success) return { ok: false, error: "This file is not a Reviewer Groups export." };
  if (file.data.version > GROUP_FILE_VERSION) {
    return {
      ok: false,
      error: "This file comes from a newer version of Reviewer Groups. Update the extension, then import it.",
    };
  }
  const groups: ImportedGroup[] = [];
  for (const [index, raw] of file.data.groups.entries()) {
    const group = importedGroupSchema.safeParse(raw);
    if (!group.success) {
      return { ok: false, error: `Group ${index + 1} in this file is not valid, so nothing was imported.` };
    }
    groups.push(group.data);
  }
  return { ok: true, groups };
};

const sameGroupKey = ({ name, members }: { name: string; members: string[] }): string =>
  JSON.stringify([name.trim().toLowerCase(), members.map((member) => member.toLowerCase()).sort()]);

export interface ImportMerge {
  groups: Group[];
  addedIds: string[];
  skipped: number;
}

export const mergeImportedGroups = (
  saved: Group[],
  imported: ImportedGroup[],
  newId: () => string,
): ImportMerge => {
  const known = new Set(saved.map(sameGroupKey));
  const merge: ImportMerge = { groups: [...saved], addedIds: [], skipped: 0 };
  for (const group of imported) {
    const key = sameGroupKey(group);
    if (known.has(key)) {
      merge.skipped += 1;
      continue;
    }
    known.add(key);
    const { repos, ask, ...stored } = group;
    const added: Group = {
      ...stored,
      id: newId(),
      ...(repos === undefined ? {} : { repos }),
      ...(ask === undefined ? {} : { ask }),
    };
    merge.groups.push(added);
    merge.addedIds.push(added.id);
  }
  return merge;
};
