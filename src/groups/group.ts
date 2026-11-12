import * as z from "zod/mini";

const LOGIN_PATTERN = "[a-z\\d][a-z\\d-]{0,38}";
const MEMBER_PATTERN = new RegExp(`^${LOGIN_PATTERN}(?:_[a-z\\d]+|/[a-z\\d][a-z\\d_-]*)?$`, "i");

export const memberSchema = z.string().check(z.regex(MEMBER_PATTERN));

export const groupSchema = z.object({
  id: z.string().check(z.minLength(1)),
  name: z.string().check(z.trim(), z.minLength(1), z.maxLength(60)),
  members: z.array(memberSchema).check(z.minLength(1)),
});

export type Group = z.infer<typeof groupSchema>;

export class StoredGroupsInvalidError extends Error {
  override readonly name = "StoredGroupsInvalidError";
}

export const parseStoredGroups = (raw: unknown): Group[] => {
  if (raw === undefined) return [];
  const result = z.array(groupSchema).safeParse(raw);
  if (!result.success) {
    throw new StoredGroupsInvalidError(z.prettifyError(result.error), { cause: result.error });
  }
  return result.data;
};
