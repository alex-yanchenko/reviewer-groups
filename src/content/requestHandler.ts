import {
  COUNT_OPEN_REQUESTS,
  countOpenRequestsMessageSchema,
  LIST_REVIEWERS,
  listReviewersMessageSchema,
  LOOK_UP_GROUP,
  lookUpGroupMessageSchema,
  REMOVE_REVIEWERS,
  removeReviewersMessageSchema,
  REQUEST_REVIEW,
  requestReviewMessageSchema,
  type CountOpenRequestsReply,
  type ListReviewersReply,
  type LookUpGroupReply,
  type RemoveReviewersReply,
  type RequestReviewReply,
} from "../messages";
import { PageCouldNotFinishError, pageMessenger, type PageProtocol } from "../pageMessenger";
import {
  ConversationPageUnreadableError,
  isShowingPullRequest,
  NotSignedInError,
  PullRequestChangedError,
  PullRequestPageMissingError,
  ReviewerFormMissingError,
} from "./conversationPage";
import {
  GitHubAnswerError,
  GitHubAnswerUnreadableError,
  listReviewers,
  lookUpGroup,
  removeReviewersFrom,
  RequestInProgressError,
  requestReviewFrom,
  type GitHubPage,
} from "./githubReviewers";
import { countOpenReviewRequests, SearchAnswerUnreadableError, SearchLimitedError } from "./openRequests";

const EXPECTED_FAILURES = [
  ConversationPageUnreadableError,
  GitHubAnswerError,
  GitHubAnswerUnreadableError,
  NotSignedInError,
  PullRequestChangedError,
  PullRequestPageMissingError,
  RequestInProgressError,
  ReviewerFormMissingError,
  SearchAnswerUnreadableError,
  SearchLimitedError,
];

const replyWithExpectedFailure = (error: unknown): { ok: false; error: string } => {
  if (EXPECTED_FAILURES.some((failure) => error instanceof failure)) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  throw error;
};

const handleListReviewers = (page: GitHubPage, message: unknown): Promise<ListReviewersReply> => {
  const parsed = listReviewersMessageSchema.safeParse(message);
  if (!parsed.success) {
    return Promise.resolve({ ok: false, error: "The request did not carry a valid search." });
  }
  page.conversation.enterSession(parsed.data.session);
  return listReviewers(page, parsed.data.query).then(
    (list) => ({ ok: true, ...list }),
    replyWithExpectedFailure,
  );
};

const requestFromThisPullRequest = async (page: GitHubPage, pullRequest: string, members: string[]) => {
  if (!isShowingPullRequest(page.doc, pullRequest)) throw new PullRequestChangedError();
  return requestReviewFrom(page, members);
};

const handleRequestReview = (page: GitHubPage, message: unknown): Promise<RequestReviewReply> => {
  const parsed = requestReviewMessageSchema.safeParse(message);
  if (!parsed.success) {
    return Promise.resolve({ ok: false, error: "The request did not carry a valid member list." });
  }
  page.conversation.enterSession(parsed.data.session);
  return requestFromThisPullRequest(page, parsed.data.pullRequest, parsed.data.members).then(
    (outcome) => ({ ok: true, outcome }),
    replyWithExpectedFailure,
  );
};

const handleCountOpenRequests = (page: GitHubPage, message: unknown): Promise<CountOpenRequestsReply> => {
  const parsed = countOpenRequestsMessageSchema.safeParse(message);
  if (!parsed.success) {
    return Promise.resolve({
      ok: false,
      error: "The request did not carry a person's login.",
      limited: false,
    });
  }
  return countOpenReviewRequests(page, parsed.data.login).then(
    (count) => ({ ok: true, count }),
    (error: unknown) => ({
      ...replyWithExpectedFailure(error),
      limited: error instanceof SearchLimitedError,
    }),
  );
};

const handleLookUpGroup = (page: GitHubPage, message: unknown): Promise<LookUpGroupReply> => {
  const parsed = lookUpGroupMessageSchema.safeParse(message);
  if (!parsed.success) {
    return Promise.resolve({ ok: false, error: "The request did not carry a valid member list." });
  }
  page.conversation.enterSession(parsed.data.session);
  return lookUpGroup(page, parsed.data.members).then(
    (lookup) => ({ ok: true, ...lookup }),
    replyWithExpectedFailure,
  );
};

const removeFromThisPullRequest = async (page: GitHubPage, pullRequest: string, members: string[]) => {
  if (!isShowingPullRequest(page.doc, pullRequest)) throw new PullRequestChangedError();
  return removeReviewersFrom(page, members);
};

const handleRemoveReviewers = (page: GitHubPage, message: unknown): Promise<RemoveReviewersReply> => {
  const parsed = removeReviewersMessageSchema.safeParse(message);
  if (!parsed.success) {
    return Promise.resolve({ ok: false, error: "The request did not carry a valid member list." });
  }
  page.conversation.enterSession(parsed.data.session);
  return removeFromThisPullRequest(page, parsed.data.pullRequest, parsed.data.members).then(
    (outcome) => ({ ok: true, outcome }),
    replyWithExpectedFailure,
  );
};

export const pageHandlers: {
  [Type in keyof PageProtocol]: (
    page: GitHubPage,
    message: unknown,
  ) => Promise<ReturnType<PageProtocol[Type]>>;
} = {
  [REQUEST_REVIEW]: handleRequestReview,
  [LIST_REVIEWERS]: handleListReviewers,
  [COUNT_OPEN_REQUESTS]: handleCountOpenRequests,
  [LOOK_UP_GROUP]: handleLookUpGroup,
  [REMOVE_REVIEWERS]: handleRemoveReviewers,
};

const answerFor =
  <Reply>(page: GitHubPage, handle: (page: GitHubPage, message: unknown) => Promise<Reply>) =>
  ({ data }: { data: unknown }): Promise<Reply> =>
    handle(page, data).catch((error: unknown) => {
      throw new PageCouldNotFinishError(error);
    });

export const listenToPopup = (page: GitHubPage): void => {
  pageMessenger.onMessage(REQUEST_REVIEW, answerFor(page, pageHandlers[REQUEST_REVIEW]));
  pageMessenger.onMessage(LIST_REVIEWERS, answerFor(page, pageHandlers[LIST_REVIEWERS]));
  pageMessenger.onMessage(COUNT_OPEN_REQUESTS, answerFor(page, pageHandlers[COUNT_OPEN_REQUESTS]));
  pageMessenger.onMessage(LOOK_UP_GROUP, answerFor(page, pageHandlers[LOOK_UP_GROUP]));
  pageMessenger.onMessage(REMOVE_REVIEWERS, answerFor(page, pageHandlers[REMOVE_REVIEWERS]));
};
