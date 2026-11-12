import * as z from "zod/mini";

const LOGIN_PATTERN = "[a-z\\d][a-z\\d-]{0,38}";
const MEMBER_PATTERN = new RegExp(`^${LOGIN_PATTERN}(?:_[a-z\\d]+|\\[bot\\]|/[a-z\\d][a-z\\d_-]*)?$`, "i");

export const memberSchema = z.string().check(z.regex(MEMBER_PATTERN));

export const groupSchema = z.object({
  id: z.string().check(z.minLength(1)),
  name: z.string().check(z.trim(), z.minLength(1), z.maxLength(60)),
  members: z.array(memberSchema).check(z.minLength(1)),
});

export type Group = z.infer<typeof groupSchema>;

export const readStoredGroup = (raw: unknown): Group | undefined => {
  const result = groupSchema.safeParse(raw);
  return result.success ? result.data : undefined;
};
