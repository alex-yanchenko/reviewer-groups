import {
  LIST_REVIEWERS,
  REQUEST_REVIEW,
  requestReviewMessageSchema,
  type ListReviewersReply,
  type RequestReviewReply,
} from "../messages";
import {
  readReviewerCandidates,
  ReviewerOptionsTimeoutError,
  ReviewerPickerMissingError,
  requestReviewFrom,
} from "./reviewerPicker";

export const PICKER_TIMEOUT_MS = 8000;

const EXTENSION_MESSAGE_TYPES: ReadonlySet<unknown> = new Set([REQUEST_REVIEW, LIST_REVIEWERS]);

export const isExtensionMessage = (message: unknown): message is { type: string } =>
  typeof message === "object" &&
  message !== null &&
  "type" in message &&
  EXTENSION_MESSAGE_TYPES.has(message.type);

const replyWithPickerFailure = (error: unknown): { ok: false; error: string } => {
  if (error instanceof ReviewerPickerMissingError || error instanceof ReviewerOptionsTimeoutError) {
    return { ok: false, error: error.message };
  }
  throw error;
};

const requestReviewReply = (doc: Document, members: readonly string[]): Promise<RequestReviewReply> =>
  requestReviewFrom(doc, members, { timeoutMs: PICKER_TIMEOUT_MS }).then(
    (outcome) => ({ ok: true, outcome }),
    replyWithPickerFailure,
  );

const listReviewersReply = (doc: Document): Promise<ListReviewersReply> =>
  readReviewerCandidates(doc, { timeoutMs: PICKER_TIMEOUT_MS }).then(
    (candidates) => ({ ok: true, candidates }),
    replyWithPickerFailure,
  );

export const handleExtensionMessage = async (
  doc: Document,
  message: unknown,
): Promise<RequestReviewReply | ListReviewersReply | undefined> => {
  if (!isExtensionMessage(message)) return undefined;
  if (message.type === LIST_REVIEWERS) return listReviewersReply(doc);
  const parsed = requestReviewMessageSchema.safeParse(message);
  if (!parsed.success) return { ok: false, error: "The request did not carry a valid member list." };
  return requestReviewReply(doc, parsed.data.members);
};
