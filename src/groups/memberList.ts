import { memberSchema } from "./group";

export interface MemberList {
  members: string[];
  invalid: string[];
}

const splitEntries = (text: string): string[] =>
  text
    .split(/[\s,]+/)
    .map((entry) => entry.replace(/^@/, ""))
    .filter((entry) => entry.length > 0);

export const parseMemberList = (text: string): MemberList => {
  const list: MemberList = { members: [], invalid: [] };
  const seen = new Set<string>();
  for (const entry of splitEntries(text)) {
    if (!memberSchema.safeParse(entry).success) {
      list.invalid.push(entry);
      continue;
    }
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.members.push(entry);
  }
  return list;
};
