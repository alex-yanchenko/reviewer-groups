import * as z from "zod/mini";
import type { ReviewRequestOutcome } from "./content/reviewerPicker";
import { memberSchema } from "./groups/group";

export const REQUEST_REVIEW = "request-review";

export const requestReviewMessageSchema = z.object({
  type: z.literal(REQUEST_REVIEW),
  members: z.array(memberSchema).check(z.minLength(1)),
});

export type RequestReviewMessage = z.infer<typeof requestReviewMessageSchema>;

export type RequestReviewReply = { ok: true; outcome: ReviewRequestOutcome } | { ok: false; error: string };

export const describeOutcome = ({ added, alreadyRequested, notFound }: ReviewRequestOutcome): string =>
  [
    added.length > 0 ? `Requested ${added.join(", ")}.` : "Nobody new to request.",
    alreadyRequested.length > 0 ? `Already requested: ${alreadyRequested.join(", ")}.` : "",
    notFound.length > 0 ? `Not a reviewer option on this PR: ${notFound.join(", ")}.` : "",
  ]
    .filter((sentence) => sentence.length > 0)
    .join(" ");

export const describeReply = (reply: RequestReviewReply): string =>
  reply.ok ? describeOutcome(reply.outcome) : reply.error;
