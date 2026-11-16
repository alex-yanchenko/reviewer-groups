import * as z from "zod/mini";

const NAME = "[A-Za-z0-9._-]+";
const REPO_PATTERN = new RegExp(`^${NAME}/(?:${NAME}|\\*)$`);
const OWNER_WILDCARD = "*";

export const repoPatternSchema = z.string().check(z.regex(REPO_PATTERN));

export interface RepoPatternList {
  patterns: string[];
  invalid: string[];
}

export const parseRepoPatterns = (text: string): RepoPatternList => {
  const list: RepoPatternList = { patterns: [], invalid: [] };
  const seen = new Set<string>();
  for (const entry of text.split(/[\s,]+/).filter((part) => part.length > 0)) {
    if (!repoPatternSchema.safeParse(entry).success) {
      list.invalid.push(entry);
      continue;
    }
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.patterns.push(entry);
  }
  return list;
};

const patternMatches = (pattern: string, repository: string): boolean => {
  const [owner, repo] = pattern.toLowerCase().split("/");
  const [repositoryOwner, repositoryName] = repository.toLowerCase().split("/");
  return owner === repositoryOwner && (repo === OWNER_WILDCARD || repo === repositoryName);
};

export const linksToRepository = (patterns: readonly string[] | undefined, repository: string): boolean =>
  (patterns ?? []).some((pattern) => patternMatches(pattern, repository));

export const repositoryOf = (pullRequest: string | null): string | null =>
  pullRequest === null ? null : (pullRequest.split("#")[0] ?? null);
