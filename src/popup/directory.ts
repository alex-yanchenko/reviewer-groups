import * as z from "zod/mini";
import { memberSchema } from "../groups/group";
import type { StorageArea } from "../groups/storage";
import type { ReviewerCandidate } from "../messages";
import { trustedAvatarUrl } from "./avatar";

export const DIRECTORY_KEY = "directory";

export type DirectoryArea = Pick<StorageArea, "get" | "set">;

const rememberedPersonSchema = z.object({
  login: memberSchema,
  description: z.string(),
  avatarUrl: z.nullable(z.string()),
  team: z.boolean(),
});

export type RememberedPerson = z.infer<typeof rememberedPersonSchema>;

const storedDirectorySchema = z.object({
  people: z.record(z.string(), z.unknown()),
  gone: z.array(z.string()),
});

export interface Directory {
  people: Record<string, RememberedPerson>;
  gone: string[];
}

export const EMPTY_DIRECTORY: Directory = { people: {}, gone: [] };

const loginKey = (login: string) => login.toLowerCase();

const readPerson = ([key, raw]: [string, unknown]): [string, RememberedPerson][] => {
  const result = rememberedPersonSchema.safeParse(raw);
  return result.success
    ? [[key, { ...result.data, avatarUrl: trustedAvatarUrl(result.data.avatarUrl) }]]
    : [];
};

export const loadDirectory = async (area: DirectoryArea): Promise<Directory> => {
  const stored = storedDirectorySchema.safeParse((await area.get(DIRECTORY_KEY))[DIRECTORY_KEY]);
  if (!stored.success) return EMPTY_DIRECTORY;
  return {
    people: Object.fromEntries(Object.entries(stored.data.people).flatMap(readPerson)),
    gone: stored.data.gone.map(loginKey),
  };
};

export const saveDirectory = (area: DirectoryArea, directory: Directory): Promise<void> =>
  area.set({ [DIRECTORY_KEY]: directory });

export const rememberPeople = (directory: Directory, found: ReviewerCandidate[]): Directory => {
  const foundKeys = new Set(found.map((candidate) => loginKey(candidate.login)));
  return {
    people: {
      ...directory.people,
      ...Object.fromEntries(
        found.map(({ login, description, avatarUrl, team }) => [
          loginKey(login),
          { login, description, avatarUrl, team },
        ]),
      ),
    },
    gone: directory.gone.filter((login) => !foundKeys.has(login)),
  };
};

export const markGone = (directory: Directory, logins: string[]): Directory => ({
  ...directory,
  gone: [...new Set([...directory.gone, ...logins.map(loginKey)])],
});

export const isGone = (directory: Directory, login: string): boolean =>
  directory.gone.includes(loginKey(login));

export const rememberedPerson = (directory: Directory, login: string): RememberedPerson | undefined =>
  directory.people[loginKey(login)];

export const rememberedPeople = (directory: Directory): ReviewerCandidate[] =>
  Object.values(directory.people)
    .sort((a, b) => a.login.localeCompare(b.login, undefined, { sensitivity: "base" }))
    .map((person) => ({ ...person, requested: false, available: true }));
