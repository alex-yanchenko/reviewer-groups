import type { Group } from "../groups/group";
import {
  describeOutcomeProblems,
  joinSentences,
  listSentence,
  type LookUpGroupReply,
  type RequestReviewReply,
  type ReviewRequestOutcome,
} from "../messages";

export interface PickedReviewer {
  login: string;
  openRequests: number | null;
}

export interface AskOutcome {
  wanted: number;
  picked: PickedReviewer[];
  alreadyRequested: string[];
  problems: ReviewRequestOutcome;
}

export type AskReply = { ok: true; ask: AskOutcome } | { ok: false; error: string; added: string[] };

export interface AskDependencies {
  lookUp: (members: string[]) => Promise<LookUpGroupReply>;
  count: (login: string) => Promise<number | null>;
  request: (members: string[]) => Promise<RequestReviewReply>;
  lastAsked: Record<string, number>;
}

interface RankedCandidate extends PickedReviewer {
  lastAsked: number;
}

const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const asksSome = (group: Group): boolean =>
  group.ask !== undefined && group.ask < group.members.length;

const emptyOutcome = (): ReviewRequestOutcome => ({
  added: [],
  alreadyRequested: [],
  unavailable: [],
  notFound: [],
  unconfirmed: [],
  gone: [],
});

const fewestOpenRequestsFirst = (a: RankedCandidate, b: RankedCandidate): number => {
  if (a.openRequests !== b.openRequests) {
    if (a.openRequests === null) return 1;
    if (b.openRequests === null) return -1;
    return a.openRequests - b.openRequests;
  }
  return a.lastAsked - b.lastAsked;
};

const rankByLoad = async (
  logins: string[],
  { count, lastAsked }: Pick<AskDependencies, "count" | "lastAsked">,
): Promise<RankedCandidate[]> => {
  const ranked = await Promise.all(
    logins.map(async (login) => ({
      login,
      openRequests: await count(login),
      lastAsked: lastAsked[login.toLowerCase()] ?? 0,
    })),
  );
  return ranked.sort(fewestOpenRequestsFirst);
};

const sortLookup = (lookup: Extract<LookUpGroupReply, { ok: true }>) => {
  const problems = emptyOutcome();
  const alreadyRequested: string[] = [];
  const eligible: string[] = [];
  for (const { member, candidate } of lookup.members) {
    const isAuthor = lookup.author !== null && sameLogin(member, lookup.author);
    if (candidate === null) problems.notFound.push(member);
    else if (candidate.requested) alreadyRequested.push(member);
    else if (!candidate.available) problems.unavailable.push(member);
    else if (candidate.reviewState === null && !isAuthor) eligible.push(member);
  }
  return { problems, alreadyRequested, eligible };
};

const recordBatch = (batch: RankedCandidate[], outcome: ReviewRequestOutcome, ask: AskOutcome): void => {
  for (const candidate of batch) {
    if (outcome.added.some((login) => sameLogin(login, candidate.login))) {
      ask.picked.push({ login: candidate.login, openRequests: candidate.openRequests });
    }
  }
  ask.alreadyRequested.push(...outcome.alreadyRequested);
  ask.problems.unavailable.push(...outcome.unavailable);
  ask.problems.notFound.push(...outcome.notFound);
  ask.problems.unconfirmed.push(...outcome.unconfirmed);
  ask.problems.gone.push(...outcome.gone);
};

const stillWanted = (ask: AskOutcome) => ask.wanted - ask.picked.length - ask.alreadyRequested.length;

export const askGroup = async (group: Group, dependencies: AskDependencies): Promise<AskReply> => {
  const lookup = await dependencies.lookUp(group.members);
  if (!lookup.ok) return { ok: false, error: lookup.error, added: [] };
  const { problems, alreadyRequested, eligible } = sortLookup(lookup);
  const ask: AskOutcome = {
    wanted: Math.min(group.ask ?? group.members.length, group.members.length),
    picked: [],
    alreadyRequested,
    problems,
  };
  if (stillWanted(ask) <= 0) return { ok: true, ask };
  const queue = await rankByLoad(eligible, dependencies);
  while (stillWanted(ask) > 0 && queue.length > 0) {
    const batch = queue.splice(0, stillWanted(ask));
    const reply = await dependencies.request(batch.map(({ login }) => login));
    if (!reply.ok) return { ok: false, error: reply.error, added: ask.picked.map(({ login }) => login) };
    recordBatch(batch, reply.outcome, ask);
  }
  return { ok: true, ask };
};

const describePick = ({ login, openRequests }: PickedReviewer) =>
  `${login} (${openRequests === null ? "count unknown" : `${openRequests} open`})`;

export const describeAsk = (groupName: string, ask: AskOutcome): string => {
  const asked = ask.picked.length + ask.alreadyRequested.length;
  return joinSentences([
    ask.picked.length > 0
      ? `Picked ${ask.picked.map(describePick).join(", ")} from ${groupName}.`
      : `Nobody new to request from ${groupName}.`,
    listSentence("Already requested: ", ask.alreadyRequested),
    describeOutcomeProblems(ask.problems),
    asked < ask.wanted ? `Only ${asked} of ${ask.wanted} could be asked.` : "",
  ]);
};
