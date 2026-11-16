import { GitHubAnswerError, type GitHubPage } from "./githubPage";

const REVIEWER_FORM = 'form[action$="/review-requests"]';
const SIDEBAR_ITEM = ".discussion-sidebar-item";
const REVIEWER_ROW = "div.d-flex.flex-items-center";
const SIGNED_IN_LOGIN = 'meta[name="user-login"]';
const PULL_REQUEST_PATH = /^\/[^/]+\/[^/]+\/pull\/\d+(?=\/|$)/;
const LOGIN_PATHS: ReadonlySet<string> = new Set(["/login", "/session"]);

export type ReviewState = "approved" | "changesRequested" | "commented";

export class PullRequestPageMissingError extends Error {
  override readonly name = "PullRequestPageMissingError";
  constructor() {
    super("This tab is not a GitHub pull request.");
  }
}

export class NotSignedInError extends Error {
  override readonly name = "NotSignedInError";
  constructor() {
    super("Sign in to GitHub in this tab to request reviews.");
  }
}

export class ReviewerFormMissingError extends Error {
  override readonly name = "ReviewerFormMissingError";
  constructor() {
    super("Your GitHub account cannot request reviewers on this pull request.");
  }
}

export class ConversationPageUnreadableError extends Error {
  override readonly name = "ConversationPageUnreadableError";
  constructor() {
    super("GitHub's pull request page came back in a shape this extension does not understand.");
  }
}

export interface ReviewerForm {
  element: HTMLFormElement;
  action: URL;
  live: boolean;
}

export const pullRequestPath = (doc: Document): string => {
  const path = PULL_REQUEST_PATH.exec(doc.location.pathname);
  if (path === null) throw new PullRequestPageMissingError();
  return path[0];
};

export const pullRequestUrl = (doc: Document, suffix = ""): URL =>
  new URL(`${pullRequestPath(doc)}${suffix}`, doc.location.origin);

const landedOnLoginPage = (response: Response): boolean => {
  const url = URL.parse(response.url);
  return url !== null && LOGIN_PATHS.has(url.pathname);
};

const fetchConversation = async ({ doc, fetch }: GitHubPage): Promise<Document> => {
  const response = await fetch(pullRequestUrl(doc).href, {
    headers: { Accept: "text/html" },
    credentials: "same-origin",
  });
  if (landedOnLoginPage(response)) throw new NotSignedInError();
  if (!response.ok) throw new GitHubAnswerError(response.status);
  return new DOMParser().parseFromString(await response.text(), "text/html");
};

export const readConversation = async (page: GitHubPage): Promise<Document> => {
  pullRequestPath(page.doc);
  if (page.doc.querySelector(REVIEWER_FORM) !== null) return page.doc;
  const cached = page.conversation.read();
  if (cached !== null) return cached;
  const fetched = await fetchConversation(page);
  page.conversation.keep(fetched);
  return fetched;
};

const whyTheFormIsMissing = (doc: Document): Error => {
  const login = doc.querySelector(SIGNED_IN_LOGIN);
  if (login === null) return new ConversationPageUnreadableError();
  return login.getAttribute("content") ? new ReviewerFormMissingError() : new NotSignedInError();
};

const postsToThisPullRequest = (page: GitHubPage, action: URL): boolean =>
  action.origin === page.doc.location.origin &&
  action.pathname.toLowerCase() === pullRequestUrl(page.doc, "/review-requests").pathname.toLowerCase();

export const findReviewerForm = (page: GitHubPage, doc: Document): ReviewerForm => {
  const element = doc.querySelector<HTMLFormElement>(REVIEWER_FORM);
  if (element === null) throw whyTheFormIsMissing(doc);
  const action = new URL(element.getAttribute("action") ?? "", page.doc.location.origin);
  if (!postsToThisPullRequest(page, action)) throw new ConversationPageUnreadableError();
  return { element, action, live: doc === page.doc };
};

export const readReviewerForm = async (page: GitHubPage): Promise<ReviewerForm> =>
  findReviewerForm(page, await readConversation(page));

export const showFreshSidebar = (form: ReviewerForm, html: string): void => {
  if (!form.live) return;
  const fresh = new DOMParser().parseFromString(html, "text/html").querySelector(SIDEBAR_ITEM);
  const current = form.element.closest(SIDEBAR_ITEM);
  if (fresh !== null && current !== null) current.replaceWith(form.element.ownerDocument.adoptNode(fresh));
};

const REVIEW_STATE_TOOLTIPS: [RegExp, ReviewState][] = [
  [/approved these changes/i, "approved"],
  [/requested changes/i, "changesRequested"],
  [/left review comments/i, "commented"],
];

const reviewStateOf = (row: Element): ReviewState | undefined => {
  const tooltips = [...row.querySelectorAll("tool-tip")].map((tooltip) => tooltip.textContent ?? "");
  return REVIEW_STATE_TOOLTIPS.find(([pattern]) => tooltips.some((text) => pattern.test(text)))?.[1];
};

const PULL_REQUEST_AUTHOR = ".gh-header-meta a.author";

export const readAuthor = (doc: Document): string | null => {
  const author = doc.querySelector(PULL_REQUEST_AUTHOR)?.textContent?.trim() ?? "";
  return author.length > 0 ? author : null;
};

export interface ReviewLeft {
  login: string;
  reviewState: ReviewState;
}

const reviewLeftIn = (row: Element): ReviewLeft[] => {
  const login = [...row.querySelectorAll("a")]
    .map((link) => link.textContent?.trim() ?? "")
    .find((text) => text.length > 0);
  const reviewState = reviewStateOf(row);
  return login !== undefined && reviewState !== undefined ? [{ login, reviewState }] : [];
};

export const readReviewsLeft = (doc: Document): ReviewLeft[] => {
  const sidebar = doc.querySelector(REVIEWER_FORM)?.closest(SIDEBAR_ITEM);
  return [...(sidebar?.querySelectorAll(REVIEWER_ROW) ?? [])].flatMap(reviewLeftIn);
};

export const readReviewStates = (doc: Document): Map<string, ReviewState> =>
  new Map(readReviewsLeft(doc).map(({ login, reviewState }) => [login.toLowerCase(), reviewState]));
