import * as z from "zod/mini";
import {
  landedOnLoginPage,
  NotSignedInError,
  pullRequestPath,
  pullRequestUrl,
  readAuthor,
  readConversation,
  readReviewerForm,
  readReviewsLeft,
  readReviewStates,
  showFreshSidebar,
  showsSignInForm,
  type ReviewState,
} from "./conversationPage";
import { GitHubAnswerError, type GitHubPage } from "./githubPage";

export { GitHubAnswerError };
export type { GitHubPage, ReviewState };

const USER_FIELD = "reviewer_user_ids[]";
const TEAM_FIELD = "reviewer_team_ids[]";

export interface ReviewerCandidate {
  login: string;
  description: string;
  avatarUrl: string | null;
  team: boolean;
  requested: boolean;
  available: boolean;
  reviewState: ReviewState | null;
}

export interface ReviewRequestOutcome {
  added: string[];
  alreadyRequested: string[];
  unavailable: string[];
  notFound: string[];
  unconfirmed: string[];
  dropped: string[];
  gone: string[];
}

export class GitHubAnswerUnreadableError extends Error {
  override readonly name = "GitHubAnswerUnreadableError";
  constructor() {
    super("GitHub's reviewer list came back in a shape this extension does not understand.");
  }
}

export class RequestInProgressError extends Error {
  override readonly name = "RequestInProgressError";
  constructor() {
    super("A review request is still running in this tab.");
  }
}

const reviewerEntrySchema = z.object({
  id: z.number(),
  login: z.string(),
  type: z.string(),
  selected: z.boolean(),
  disabled: z.nullish(z.boolean()),
  avatar: z.nullish(z.string()),
  name: z.optional(z.unknown()),
  description: z.nullish(z.string()),
});

type ReviewerEntry = z.infer<typeof reviewerEntrySchema>;

const claimsToBeRequestedSchema = z.object({ selected: z.literal(true) });

const reviewerAnswerSchema = z.object({
  suggestions: z.optional(z.array(z.unknown())),
  users: z.optional(z.array(z.unknown())),
});

const readEntry = (raw: unknown): ReviewerEntry[] => {
  const result = reviewerEntrySchema.safeParse(raw);
  return result.success ? [result.data] : [];
};

const isUnreadableRequestedEntry = (raw: unknown): boolean =>
  claimsToBeRequestedSchema.safeParse(raw).success && !reviewerEntrySchema.safeParse(raw).success;

interface ReadEntries {
  entries: ReviewerEntry[];
  requestedUnreadable: boolean;
}

const readEntries = (answer: unknown): ReadEntries => {
  const parsed = reviewerAnswerSchema.safeParse(answer);
  if (!parsed.success) throw new GitHubAnswerUnreadableError();
  const raw = [...(parsed.data.suggestions ?? []), ...(parsed.data.users ?? [])];
  const entries = raw.flatMap(readEntry);
  if (raw.length > 0 && entries.length === 0) throw new GitHubAnswerUnreadableError();
  return { entries, requestedUnreadable: raw.some(isUnreadableRequestedEntry) };
};

const readJsonOrSayWhyNot = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw showsSignInForm(text) ? new NotSignedInError() : new GitHubAnswerUnreadableError();
  }
};

const fetchEntries = async (
  { doc, fetch }: GitHubPage,
  query: string,
  path: string,
): Promise<ReadEntries> => {
  const url = pullRequestUrl(doc, "/review-requests", path);
  url.searchParams.set("typeAhead", "true");
  url.searchParams.set("q", query);
  const response = await fetch(url.href, {
    headers: { "X-Requested-With": "XMLHttpRequest" },
    credentials: "same-origin",
  });
  if (landedOnLoginPage(response)) throw new NotSignedInError();
  if (!response.ok) throw new GitHubAnswerError(response.status);
  return readEntries(await readJsonOrSayWhyNot(response));
};

const searchReviewers = async (
  page: GitHubPage,
  query: string,
  path = pullRequestPath(page.doc),
  requestedMustBeReadable = false,
): Promise<ReviewerEntry[]> => {
  const { entries, requestedUnreadable } = await fetchEntries(page, query, path);
  if (requestedMustBeReadable && requestedUnreadable) throw new GitHubAnswerUnreadableError();
  return entries;
};

const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const describeEntry = (
  { login, type, selected, disabled, avatar, name, description }: ReviewerEntry,
  reviewStates: Map<string, ReviewState>,
): ReviewerCandidate => ({
  login,
  description: typeof name === "string" && name.length > 0 ? name : (description ?? ""),
  avatarUrl: avatar ?? null,
  team: type === "team",
  requested: selected,
  available: !(disabled ?? false),
  reviewState: reviewStates.get(login.toLowerCase()) ?? null,
});

export const searchReviewerCandidates = async (
  page: GitHubPage,
  query: string,
): Promise<ReviewerCandidate[]> => {
  const entries = await searchReviewers(page, query);
  const reviewStates = readReviewStates(await readConversation(page));
  return entries.map((entry) => describeEntry(entry, reviewStates));
};

export interface ReviewedPerson {
  login: string;
  reviewState: ReviewState;
  requested: boolean;
}

export interface ReviewerList {
  candidates: ReviewerCandidate[];
  reviewed: ReviewedPerson[];
}

export const listReviewers = async (page: GitHubPage, query: string): Promise<ReviewerList> => {
  const path = pullRequestPath(page.doc);
  const candidates = await searchReviewerCandidates(page, query);
  const requestedLogins =
    query === ""
      ? candidates.filter(({ requested }) => requested).map(({ login }) => login)
      : (await searchReviewers(page, "", path)).filter(({ selected }) => selected).map(({ login }) => login);
  const reviewed = readReviewsLeft(await readConversation(page)).map((review) => ({
    ...review,
    requested: requestedLogins.some((login) => sameLogin(login, review.login)),
  }));
  return { candidates, reviewed };
};

const lookUpMember = async (page: GitHubPage, member: string, path = pullRequestPath(page.doc)) => ({
  member,
  entry: (await searchReviewers(page, member, path)).find((entry) => sameLogin(entry.login, member)),
});

export interface MemberLookup {
  member: string;
  candidate: ReviewerCandidate | null;
}

export interface GroupLookup {
  members: MemberLookup[];
  author: string | null;
}

export const lookUpGroup = async (page: GitHubPage, members: readonly string[]): Promise<GroupLookup> => {
  const found = await Promise.all(members.map((member) => lookUpMember(page, member)));
  const conversation = await readConversation(page);
  const reviewStates = readReviewStates(conversation);
  return {
    members: found.map(({ member, entry }) => ({
      member,
      candidate: entry === undefined ? null : describeEntry(entry, reviewStates),
    })),
    author: readAuthor(conversation),
  };
};

const reviewerFormBody = (form: HTMLFormElement, reviewers: ReviewerEntry[]): URLSearchParams => {
  const body = new URLSearchParams();
  for (const [field, value] of new FormData(form)) {
    if (field !== USER_FIELD && field !== TEAM_FIELD && typeof value === "string") body.append(field, value);
  }
  for (const reviewer of reviewers) {
    body.append(reviewer.type === "team" ? TEAM_FIELD : USER_FIELD, String(reviewer.id));
  }
  return body;
};

const sendReviewers = async (page: GitHubPage, reviewers: ReviewerEntry[], path: string) => {
  const form = await readReviewerForm(page, path);
  const response = await page.fetch(form.action.href, {
    method: "POST",
    body: reviewerFormBody(form.element, reviewers),
    headers: { Accept: "text/html", "X-Requested-With": "XMLHttpRequest" },
    credentials: "same-origin",
  });
  page.conversation.forget();
  if (!response.ok) throw new GitHubAnswerError(response.status);
  showFreshSidebar(form, await response.text());
};

const currentlyRequested = async (page: GitHubPage, path: string) =>
  (await searchReviewers(page, "", path, true)).filter((entry) => entry.selected);

interface ConfirmedRequests {
  requested: ReviewerEntry[];
  complete: boolean;
}

const confirmedRequests = async (page: GitHubPage, path: string): Promise<ConfirmedRequests | null> => {
  try {
    const { entries, requestedUnreadable } = await fetchEntries(page, "", path);
    return { requested: entries.filter((entry) => entry.selected), complete: !requestedUnreadable };
  } catch {
    return null;
  }
};

const isRequestedIn = (confirmed: ConfirmedRequests | null, member: string): boolean =>
  confirmed?.requested.some((entry) => sameLogin(entry.login, member)) ?? false;

const droppedAccordingTo = (before: ReviewerEntry[], confirmed: ConfirmedRequests | null): string[] =>
  confirmed?.complete ? droppedBy(before, confirmed.requested) : [];

const droppedBy = (before: ReviewerEntry[], after: ReviewerEntry[]): string[] =>
  before
    .filter((entry) => !after.some((remaining) => sameLogin(remaining.login, entry.login)))
    .map((entry) => entry.login);

const profilePath = (login: string) => {
  const [owner, team] = login.split("/");
  if (team !== undefined) return `/orgs/${encodeURIComponent(owner ?? "")}/teams/${encodeURIComponent(team)}`;
  const app = /^(.+)\[bot\]$/i.exec(login);
  return app ? `/apps/${encodeURIComponent(app[1] ?? "")}` : `/${encodeURIComponent(login)}`;
};

const accountIsGone = async ({ doc, fetch }: GitHubPage, login: string): Promise<boolean> => {
  const response = await fetch(new URL(profilePath(login), doc.location.origin).href, {
    method: "HEAD",
    credentials: "same-origin",
  });
  return response.status === 404;
};

const sortOutGoneAccounts = async (page: GitHubPage, outcome: ReviewRequestOutcome) => {
  const checked = await Promise.all(
    outcome.notFound.map(async (login) => ({ login, gone: await accountIsGone(page, login) })),
  );
  outcome.notFound = checked.filter(({ gone }) => !gone).map(({ login }) => login);
  outcome.gone = checked.filter(({ gone }) => gone).map(({ login }) => login);
};

const requestLookedUpMembers = async (page: GitHubPage, members: readonly string[]) => {
  const path = pullRequestPath(page.doc);
  await readReviewerForm(page, path);
  const outcome: ReviewRequestOutcome = {
    added: [],
    alreadyRequested: [],
    unavailable: [],
    notFound: [],
    unconfirmed: [],
    dropped: [],
    gone: [],
  };
  const toAdd: { member: string; entry: ReviewerEntry }[] = [];
  for (const { member, entry } of await Promise.all(
    members.map((member) => lookUpMember(page, member, path)),
  )) {
    if (entry === undefined) outcome.notFound.push(member);
    else if (entry.selected) outcome.alreadyRequested.push(member);
    else if (entry.disabled ?? false) outcome.unavailable.push(member);
    else toAdd.push({ member, entry });
  }
  await sortOutGoneAccounts(page, outcome);
  if (toAdd.length === 0) return outcome;
  const before = await currentlyRequested(page, path);
  await sendReviewers(page, [...before, ...toAdd.map(({ entry }) => entry)], path);
  const confirmed = await confirmedRequests(page, path);
  for (const { member } of toAdd) {
    (isRequestedIn(confirmed, member) ? outcome.added : outcome.unconfirmed).push(member);
  }
  outcome.dropped.push(...droppedAccordingTo(before, confirmed));
  return outcome;
};

let writeRunning = false;

const withWriteLock = async <Result>(write: () => Promise<Result>): Promise<Result> => {
  if (writeRunning) throw new RequestInProgressError();
  writeRunning = true;
  try {
    return await write();
  } finally {
    writeRunning = false;
  }
};

export const requestReviewFrom = (
  page: GitHubPage,
  members: readonly string[],
): Promise<ReviewRequestOutcome> => withWriteLock(() => requestLookedUpMembers(page, members));

export interface RemovalOutcome {
  removed: string[];
  notRequested: string[];
  unconfirmed: string[];
  dropped: string[];
}

const removeRequestedMembers = async (page: GitHubPage, members: readonly string[]) => {
  const path = pullRequestPath(page.doc);
  await readReviewerForm(page, path);
  const current = await currentlyRequested(page, path);
  const isRequested = (requested: ReviewerEntry[], member: string) =>
    requested.some((entry) => sameLogin(entry.login, member));
  const outcome: RemovalOutcome = {
    removed: [],
    notRequested: members.filter((member) => !isRequested(current, member)),
    unconfirmed: [],
    dropped: [],
  };
  const toRemove = members.filter((member) => isRequested(current, member));
  if (toRemove.length === 0) return outcome;
  const kept = current.filter((entry) => !members.some((member) => sameLogin(member, entry.login)));
  await sendReviewers(page, kept, path);
  const confirmed = await confirmedRequests(page, path);
  for (const member of toRemove) {
    const confirmedRemoved = confirmed?.complete === true && !isRequestedIn(confirmed, member);
    (confirmedRemoved ? outcome.removed : outcome.unconfirmed).push(member);
  }
  outcome.dropped.push(...droppedAccordingTo(kept, confirmed));
  return outcome;
};

export const removeReviewersFrom = (page: GitHubPage, members: readonly string[]): Promise<RemovalOutcome> =>
  withWriteLock(() => removeRequestedMembers(page, members));
