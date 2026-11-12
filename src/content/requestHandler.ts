import {
  LIST_REVIEWERS,
  listReviewersMessageSchema,
  REQUEST_REVIEW,
  requestReviewMessageSchema,
  type ListReviewersReply,
  type RequestReviewReply,
} from "../messages";
import {
  ReviewerOptionsTimeoutError,
  ReviewerPickerMissingError,
  ReviewerSearchFailedError,
  requestReviewFrom,
  searchReviewerCandidates,
} from "./reviewerPicker";

export const PICKER_TIMEOUTS = { timeoutMs: 8000, searchTimeoutMs: 4000 };

const EXTENSION_MESSAGE_TYPES: ReadonlySet<unknown> = new Set([REQUEST_REVIEW, LIST_REVIEWERS]);

export const isExtensionMessage = (message: unknown): message is { type: string } =>
  typeof message === "object" &&
  message !== null &&
  "type" in message &&
  EXTENSION_MESSAGE_TYPES.has(message.type);

const replyWithPickerFailure = (error: unknown): { ok: false; error: string } => {
  if (
    error instanceof ReviewerPickerMissingError ||
    error instanceof ReviewerOptionsTimeoutError ||
    error instanceof ReviewerSearchFailedError
  ) {
    return { ok: false, error: error.message };
  }
  throw error;
};

const requestReviewReply = (doc: Document, members: readonly string[]): Promise<RequestReviewReply> =>
  requestReviewFrom(doc, members, PICKER_TIMEOUTS).then(
    (outcome) => ({ ok: true, outcome }),
    replyWithPickerFailure,
  );

const listReviewersReply = (doc: Document, query: string): Promise<ListReviewersReply> =>
  searchReviewerCandidates(doc, query, (input, init) => fetch(input, init)).then(
    (candidates) => ({ ok: true, candidates }),
    replyWithPickerFailure,
  );

const handleListReviewers = (doc: Document, message: unknown): Promise<ListReviewersReply> => {
  const parsed = listReviewersMessageSchema.safeParse(message);
  if (!parsed.success)
    return Promise.resolve({ ok: false, error: "The request did not carry a valid search." });
  return listReviewersReply(doc, parsed.data.query);
};

const handleRequestReview = (doc: Document, message: unknown): Promise<RequestReviewReply> => {
  const parsed = requestReviewMessageSchema.safeParse(message);
  if (!parsed.success)
    return Promise.resolve({ ok: false, error: "The request did not carry a valid member list." });
  return requestReviewReply(doc, parsed.data.members);
};

export const handleExtensionMessage = async (
  doc: Document,
  message: unknown,
): Promise<RequestReviewReply | ListReviewersReply | undefined> => {
  if (!isExtensionMessage(message)) return undefined;
  return message.type === LIST_REVIEWERS
    ? handleListReviewers(doc, message)
    : handleRequestReview(doc, message);
};
