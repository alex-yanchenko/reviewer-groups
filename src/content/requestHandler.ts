import {
  LIST_REVIEWERS,
  listReviewersMessageSchema,
  REQUEST_REVIEW,
  requestReviewMessageSchema,
  type ListReviewersReply,
  type RequestReviewReply,
} from "../messages";
import {
  GitHubAnswerError,
  GitHubAnswerUnreadableError,
  PullRequestPageMissingError,
  RequestInProgressError,
  ReviewerFormMissingError,
  requestReviewFrom,
  searchReviewerCandidates,
  type GitHubPage,
} from "./githubReviewers";

const EXTENSION_MESSAGE_TYPES: ReadonlySet<unknown> = new Set([REQUEST_REVIEW, LIST_REVIEWERS]);

const EXPECTED_FAILURES = [
  GitHubAnswerError,
  GitHubAnswerUnreadableError,
  PullRequestPageMissingError,
  RequestInProgressError,
  ReviewerFormMissingError,
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
  return searchReviewerCandidates(page, parsed.data.query).then(
    (candidates) => ({ ok: true, candidates }),
    replyWithExpectedFailure,
  );
};

const handleRequestReview = (page: GitHubPage, message: unknown): Promise<RequestReviewReply> => {
  const parsed = requestReviewMessageSchema.safeParse(message);
  if (!parsed.success) {
    return Promise.resolve({ ok: false, error: "The request did not carry a valid member list." });
  }
  return requestReviewFrom(page, parsed.data.members).then(
    (outcome) => ({ ok: true, outcome }),
    replyWithExpectedFailure,
  );
};

export const handleExtensionMessage = async (
  page: GitHubPage,
  message: unknown,
): Promise<RequestReviewReply | ListReviewersReply | undefined> => {
  if (!isExtensionMessage(message)) return undefined;
  return message.type === LIST_REVIEWERS
    ? handleListReviewers(page, message)
    : handleRequestReview(page, message);
};
