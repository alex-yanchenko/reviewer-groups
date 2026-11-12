import type { ReviewerCandidate } from "../messages";

const LOGIN_STARTS = 0;
const NAME_WORD_STARTS = 1;
const CONTAINS = 2;
const UNSEEN_MATCH = 3;

const rankFor = (person: ReviewerCandidate, needle: string): number => {
  const login = person.login.toLowerCase();
  const name = person.description.toLowerCase();
  if (login.startsWith(needle)) return LOGIN_STARTS;
  if (name.split(/\s+/).some((word) => word.startsWith(needle))) return NAME_WORD_STARTS;
  if (login.includes(needle) || name.includes(needle)) return CONTAINS;
  return UNSEEN_MATCH;
};

export const rankSearchResults = (query: string, people: ReviewerCandidate[]): ReviewerCandidate[] => {
  const needle = query.trim().toLowerCase();
  if (needle === "") return people;
  return people
    .map((person) => ({ person, rank: rankFor(person, needle) }))
    .filter(({ person, rank }) => !(person.requested && rank === UNSEEN_MATCH))
    .sort((a, b) => a.rank - b.rank)
    .map(({ person }) => person);
};
