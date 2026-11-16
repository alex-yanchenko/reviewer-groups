import * as z from "zod/mini";
import { repoPatternSchema } from "./repoPatterns";

const LOGIN_PATTERN = "[a-z\\d][a-z\\d-]{0,38}";
const MEMBER_PATTERN = new RegExp(`^${LOGIN_PATTERN}(?:_[a-z\\d]+|\\[bot\\]|/[a-z\\d][a-z\\d_-]*)?$`, "i");

export const memberSchema = z.string().check(z.regex(MEMBER_PATTERN));

export const isPersonLogin = (login: string): boolean => !login.includes("/") && !/\[bot\]$/i.test(login);

export const groupSchema = z.looseObject({
  id: z.string().check(z.minLength(1)),
  name: z.string().check(z.trim(), z.minLength(1), z.maxLength(60)),
  members: z.array(memberSchema).check(z.minLength(1)),
});

export type StoredGroup = z.infer<typeof groupSchema>;

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

const storedRepoListSchema = z.array(z.unknown());

const readRepoPatterns = (raw: unknown): string[] => {
  const list = storedRepoListSchema.safeParse(raw);
  if (!list.success) return [];
  return list.data.flatMap((entry) => {
    const pattern = repoPatternSchema.safeParse(entry);
    return pattern.success ? [pattern.data] : [];
  });
};

export const readGroupOptions = (raw: unknown): GroupOptions => {
  const fields = optionsFieldsSchema.safeParse(raw);
  if (!fields.success) return {};
  const repos = readRepoPatterns(fields.data.repos);
  const ask = askSchema.safeParse(fields.data.ask);
  return {
    ...(repos.length > 0 ? { repos } : {}),
    ...(ask.success ? { ask: ask.data } : {}),
  };
};

export const withOptions = (group: Group, options: GroupOptions): Group => ({
  ...splitGroupOptions(group)[0],
  ...options,
});

export const splitGroupOptions = ({ repos, ask, ...stored }: Group): [StoredGroup, GroupOptions] => [
  stored,
  { ...(repos !== undefined && repos.length > 0 ? { repos } : {}), ...(ask !== undefined ? { ask } : {}) },
];

export const hasOptions = (options: GroupOptions): boolean => Object.keys(options).length > 0;
