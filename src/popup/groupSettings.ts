import { askSchema, type GroupOptions } from "../groups/group";
import { linksToRepository, parseRepoPatterns } from "../groups/repoPatterns";

export interface GroupSettingsText {
  repos: string;
  ask: string;
}

const WHOLE_NUMBER = /^\d+$/;

export const settingsTextOf = (options: GroupOptions | undefined): GroupSettingsText => ({
  repos: (options?.repos ?? []).join(", "),
  ask: options?.ask === undefined ? "" : String(options.ask),
});

const readAsk = (text: string): GroupOptions | string => {
  const trimmed = text.trim();
  if (trimmed === "") return {};
  const ask = askSchema.safeParse(WHOLE_NUMBER.test(trimmed) ? Number(trimmed) : Number.NaN);
  return ask.success
    ? { ask: ask.data }
    : "Ask a whole number of people, 1 or more, or leave it empty for everyone.";
};

export const readGroupSettings = (text: GroupSettingsText): GroupOptions | string => {
  const { patterns, invalid } = parseRepoPatterns(text.repos);
  if (invalid.length > 0) return `Not owner/repo or owner/* patterns: ${invalid.join(", ")}`;
  const ask = readAsk(text.ask);
  if (typeof ask === "string") return ask;
  return { ...(patterns.length > 0 ? { repos: patterns } : {}), ...ask };
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
