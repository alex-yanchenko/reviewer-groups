import * as z from "zod/mini";

const REVIEWER_FORM = 'form[action$="/review-requests"]';
const SIDEBAR_ITEM = ".discussion-sidebar-item";
const REVIEWER_ROW = "div.d-flex.flex-items-center";
const USER_FIELD = "reviewer_user_ids[]";
const TEAM_FIELD = "reviewer_team_ids[]";
const PULL_REQUEST_PATH = /^\/[^/]+\/[^/]+\/pull\/\d+(?=\/|$)/;

export type ReviewState = "approved" | "changesRequested" | "commented";

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
  gone: string[];
}

export interface GitHubPage {
  doc: Document;
  fetch: typeof fetch;
}

export class PullRequestPageMissingError extends Error {
  override readonly name = "PullRequestPageMissingError";
  constructor() {
    super("This tab is not a GitHub pull request.");
  }
}

export class ReviewerFormMissingError extends Error {
  override readonly name = "ReviewerFormMissingError";
  constructor() {
    super("Open the pull request's Conversation tab to request reviews.");
  }
}

export class GitHubAnswerError extends Error {
  override readonly name = "GitHubAnswerError";
  constructor(status: number) {
    super(`GitHub answered ${status}.`);
  }
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
  disabled: z.optional(z.boolean()),
  avatar: z.optional(z.string()),
  name: z.optional(z.unknown()),
  description: z.optional(z.string()),
});

type ReviewerEntry = z.infer<typeof reviewerEntrySchema>;

const reviewerAnswerSchema = z.object({
  suggestions: z.optional(z.array(z.unknown())),
  users: z.optional(z.array(z.unknown())),
});

const reviewRequestsUrl = (doc: Document): URL => {
  const path = PULL_REQUEST_PATH.exec(doc.location.pathname);
  if (path === null) throw new PullRequestPageMissingError();
  return new URL(`${path[0]}/review-requests`, doc.location.origin);
};

const readEntry = (raw: unknown): ReviewerEntry[] => {
  const result = reviewerEntrySchema.safeParse(raw);
  return result.success ? [result.data] : [];
};

const readEntries = (answer: unknown): ReviewerEntry[] => {
  const parsed = reviewerAnswerSchema.safeParse(answer);
  if (!parsed.success) throw new GitHubAnswerUnreadableError();
  const raw = [...(parsed.data.suggestions ?? []), ...(parsed.data.users ?? [])];
  const entries = raw.flatMap(readEntry);
  if (raw.length > 0 && entries.length === 0) throw new GitHubAnswerUnreadableError();
  return entries;
};

const searchReviewers = async ({ doc, fetch }: GitHubPage, query: string): Promise<ReviewerEntry[]> => {
  const url = reviewRequestsUrl(doc);
  url.searchParams.set("typeAhead", "true");
  url.searchParams.set("q", query);
  const response = await fetch(url.href, {
    headers: { "X-Requested-With": "XMLHttpRequest" },
    credentials: "same-origin",
  });
  if (!response.ok) throw new GitHubAnswerError(response.status);
  return readEntries(await response.json());
};

const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const REVIEW_STATE_TOOLTIPS: [RegExp, ReviewState][] = [
  [/approved these changes/i, "approved"],
  [/requested changes/i, "changesRequested"],
  [/left review comments/i, "commented"],
];

const reviewStateOf = (row: Element): ReviewState | undefined => {
  const tooltips = [...row.querySelectorAll("tool-tip")].map((tooltip) => tooltip.textContent ?? "");
  return REVIEW_STATE_TOOLTIPS.find(([pattern]) => tooltips.some((text) => pattern.test(text)))?.[1];
};

const readReviewStates = (doc: Document): Map<string, ReviewState> => {
  const states = new Map<string, ReviewState>();
  const sidebar = doc.querySelector(REVIEWER_FORM)?.closest(SIDEBAR_ITEM);
  for (const row of sidebar?.querySelectorAll(REVIEWER_ROW) ?? []) {
    const login = [...row.querySelectorAll("a")]
      .map((link) => link.textContent?.trim() ?? "")
      .find((text) => text.length > 0);
    const state = reviewStateOf(row);
    if (login !== undefined && state !== undefined) states.set(login.toLowerCase(), state);
  }
  return states;
};

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
  const reviewStates = readReviewStates(page.doc);
  return entries.map((entry) => describeEntry(entry, reviewStates));
};

const lookUpMember = async (page: GitHubPage, member: string) => ({
  member,
  entry: (await searchReviewers(page, member)).find((entry) => sameLogin(entry.login, member)),
});

const findReviewerForm = (doc: Document): HTMLFormElement => {
  if (!PULL_REQUEST_PATH.test(doc.location.pathname)) throw new PullRequestPageMissingError();
  const form = doc.querySelector<HTMLFormElement>(REVIEWER_FORM);
  if (form === null) throw new ReviewerFormMissingError();
  return form;
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

const showFreshSidebar = (form: HTMLFormElement, html: string) => {
  const fresh = new DOMParser().parseFromString(html, "text/html").querySelector(SIDEBAR_ITEM);
  const current = form.closest(SIDEBAR_ITEM);
  if (fresh !== null && current !== null) current.replaceWith(form.ownerDocument.adoptNode(fresh));
};

const sendReviewers = async (page: GitHubPage, form: HTMLFormElement, reviewers: ReviewerEntry[]) => {
  const response = await page.fetch(form.action, {
    method: "POST",
    body: reviewerFormBody(form, reviewers),
    headers: { Accept: "text/html", "X-Requested-With": "XMLHttpRequest" },
    credentials: "same-origin",
  });
  if (!response.ok) throw new GitHubAnswerError(response.status);
  showFreshSidebar(form, await response.text());
};

const currentlyRequested = async (page: GitHubPage) =>
  (await searchReviewers(page, "")).filter((entry) => entry.selected);

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
  const form = findReviewerForm(page.doc);
  const outcome: ReviewRequestOutcome = {
    added: [],
    alreadyRequested: [],
    unavailable: [],
    notFound: [],
    unconfirmed: [],
    gone: [],
  };
  const toAdd: { member: string; entry: ReviewerEntry }[] = [];
  for (const { member, entry } of await Promise.all(members.map((member) => lookUpMember(page, member)))) {
    if (entry === undefined) outcome.notFound.push(member);
    else if (entry.selected) outcome.alreadyRequested.push(member);
    else if (entry.disabled ?? false) outcome.unavailable.push(member);
    else toAdd.push({ member, entry });
  }
  await sortOutGoneAccounts(page, outcome);
  if (toAdd.length === 0) return outcome;
  await sendReviewers(page, form, [...(await currentlyRequested(page)), ...toAdd.map(({ entry }) => entry)]);
  const confirmed = await currentlyRequested(page);
  for (const { member } of toAdd) {
    const isRequested = confirmed.some((entry) => sameLogin(entry.login, member));
    (isRequested ? outcome.added : outcome.unconfirmed).push(member);
  }
  return outcome;
};

let requestRunning = false;

export const requestReviewFrom = async (
  page: GitHubPage,
  members: readonly string[],
): Promise<ReviewRequestOutcome> => {
  if (requestRunning) throw new RequestInProgressError();
  requestRunning = true;
  try {
    return await requestLookedUpMembers(page, members);
  } finally {
    requestRunning = false;
  }
};
