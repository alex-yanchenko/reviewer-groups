import * as z from "zod/mini";

const LOGIN_PATTERN = "[a-z\\d][a-z\\d-]{0,38}";
const MEMBER_PATTERN = new RegExp(`^${LOGIN_PATTERN}(?:_[a-z\\d]+|\\[bot\\]|/[a-z\\d][a-z\\d_-]*)?$`, "i");

export const memberSchema = z.string().check(z.regex(MEMBER_PATTERN));

export const groupSchema = z.looseObject({
  id: z.string().check(z.minLength(1)),
  name: z.string().check(z.trim(), z.minLength(1), z.maxLength(60)),
  members: z.array(memberSchema).check(z.minLength(1)),
});

export type StoredGroup = z.infer<typeof groupSchema>;

export const repoListSchema = z.array(z.string());

export const askSchema = z.int().check(z.positive());

export interface GroupOptions {
  repos?: string[];
  ask?: number;
}

export type Group = StoredGroup & GroupOptions;

export const readStoredGroup = (raw: unknown): StoredGroup | undefined => {
  const result = groupSchema.safeParse(raw);
  return result.success ? result.data : undefined;
};

const optionsFieldsSchema = z.object({ repos: z.optional(z.unknown()), ask: z.optional(z.unknown()) });

export const readGroupOptions = (raw: unknown): GroupOptions => {
  const fields = optionsFieldsSchema.safeParse(raw);
  if (!fields.success) return {};
  const repos = repoListSchema.safeParse(fields.data.repos);
  const ask = askSchema.safeParse(fields.data.ask);
  return {
    ...(repos.success && repos.data.length > 0 ? { repos: repos.data } : {}),
    ...(ask.success ? { ask: ask.data } : {}),
  };
};

export const splitGroupOptions = ({ repos, ask, ...stored }: Group): [StoredGroup, GroupOptions] => [
  stored,
  { ...(repos !== undefined && repos.length > 0 ? { repos } : {}), ...(ask !== undefined ? { ask } : {}) },
];

export const hasOptions = (options: GroupOptions): boolean => Object.keys(options).length > 0;
