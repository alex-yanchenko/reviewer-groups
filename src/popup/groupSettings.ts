import type { GroupOptions } from "../groups/group";
import { linksToRepository, parseRepoPatterns } from "../groups/repoPatterns";

export interface GroupSettingsText {
  repos: string;
}

export const settingsTextOf = (options: GroupOptions | undefined): GroupSettingsText => ({
  repos: (options?.repos ?? []).join(", "),
});

export const readGroupSettings = (text: GroupSettingsText): GroupOptions | string => {
  const { patterns, invalid } = parseRepoPatterns(text.repos);
  if (invalid.length > 0) return `Not owner/repo or owner/* patterns: ${invalid.join(", ")}`;
  return patterns.length > 0 ? { repos: patterns } : {};
};

export interface PlacedGroup<G> {
  group: G;
  linked: boolean;
}

export const placeForRepository = <G extends GroupOptions>(
  groups: readonly G[],
  repository: string | null,
): PlacedGroup<G>[] => {
  const placed = groups.map((group) => ({
    group,
    linked: repository !== null && linksToRepository(group.repos, repository),
  }));
  return [...placed.filter(({ linked }) => linked), ...placed.filter(({ linked }) => !linked)];
};
