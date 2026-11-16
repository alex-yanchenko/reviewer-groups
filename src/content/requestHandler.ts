import {
  COUNT_OPEN_REQUESTS,
  countOpenRequestsMessageSchema,
  LIST_REVIEWERS,
  listReviewersMessageSchema,
  REQUEST_REVIEW,
  requestReviewMessageSchema,
  type CountOpenRequestsReply,
  type ListReviewersReply,
  type RequestReviewReply,
} from "../messages";
import {
  ConversationPageUnreadableError,
  NotSignedInError,
  PullRequestPageMissingError,
  ReviewerFormMissingError,
} from "./conversationPage";
import {
  GitHubAnswerError,
  GitHubAnswerUnreadableError,
  listReviewers,
  RequestInProgressError,
  requestReviewFrom,
  type GitHubPage,
} from "./githubReviewers";
import { countOpenReviewRequests, SearchAnswerUnreadableError, SearchLimitedError } from "./openRequests";

type ExtensionReply = RequestReviewReply | ListReviewersReply | CountOpenRequestsReply;

const EXTENSION_MESSAGE_TYPES: ReadonlySet<unknown> = new Set([
  REQUEST_REVIEW,
  LIST_REVIEWERS,
  COUNT_OPEN_REQUESTS,
]);

const EXPECTED_FAILURES = [
  ConversationPageUnreadableError,
  GitHubAnswerError,
  GitHubAnswerUnreadableError,
  NotSignedInError,
  PullRequestPageMissingError,
  RequestInProgressError,
  ReviewerFormMissingError,
  SearchAnswerUnreadableError,
  SearchLimitedError,
];

export const isExtensionMessage = (message: unknown): message is { type: string } =>
  typeof message === "object" &&
  message !== null &&
  "type" in message &&
  EXTENSION_MESSAGE_TYPES.has(message.type);

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

const handleRequestReview = (page: GitHubPage, message: unknown): Promise<RequestReviewReply> => {
  const parsed = requestReviewMessageSchema.safeParse(message);
  if (!parsed.success) {
    return Promise.resolve({ ok: false, error: "The request did not carry a valid member list." });
  }
  page.conversation.enterSession(parsed.data.session);
  return requestReviewFrom(page, parsed.data.members).then(
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

const HANDLERS: Record<string, (page: GitHubPage, message: unknown) => Promise<ExtensionReply>> = {
  [REQUEST_REVIEW]: handleRequestReview,
  [LIST_REVIEWERS]: handleListReviewers,
  [COUNT_OPEN_REQUESTS]: handleCountOpenRequests,
};

export const handleExtensionMessage = async (
  page: GitHubPage,
  message: unknown,
): Promise<ExtensionReply | undefined> => {
  if (!isExtensionMessage(message)) return undefined;
  return HANDLERS[message.type]?.(page, message);
};
