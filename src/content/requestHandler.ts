import { REQUEST_REVIEW, requestReviewMessageSchema, type RequestReviewReply } from "../messages";
import { ReviewerOptionsTimeoutError, ReviewerPickerMissingError, requestReviewFrom } from "./reviewerPicker";

export const PICKER_TIMEOUT_MS = 8000;

export const isRequestReviewMessage = (message: unknown): boolean =>
  typeof message === "object" && message !== null && "type" in message && message.type === REQUEST_REVIEW;

export const requestReviewReply = async (
  doc: Document,
  members: readonly string[],
): Promise<RequestReviewReply> => {
  try {
    return { ok: true, outcome: await requestReviewFrom(doc, members, { timeoutMs: PICKER_TIMEOUT_MS }) };
  } catch (error) {
    if (error instanceof ReviewerPickerMissingError || error instanceof ReviewerOptionsTimeoutError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
};

export const handleExtensionMessage = async (
  doc: Document,
  message: unknown,
): Promise<RequestReviewReply | undefined> => {
  if (!isRequestReviewMessage(message)) return undefined;
  const parsed = requestReviewMessageSchema.safeParse(message);
  if (!parsed.success) return { ok: false, error: "The request did not carry a valid member list." };
  return requestReviewReply(doc, parsed.data.members);
};
