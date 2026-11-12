import * as z from "zod/mini";
import type { ReviewerCandidate, ReviewRequestOutcome, ReviewState } from "./content/githubReviewers";
import { memberSchema } from "./groups/group";

export type { ReviewerCandidate, ReviewRequestOutcome, ReviewState };

export const REQUEST_REVIEW = "request-review";
export const LIST_REVIEWERS = "list-reviewers";

export type ListReviewersReply = { ok: true; candidates: ReviewerCandidate[] } | { ok: false; error: string };

export const requestReviewMessageSchema = z.object({
  type: z.literal(REQUEST_REVIEW),
  members: z.array(memberSchema).check(z.minLength(1)),
});

export type RequestReviewMessage = z.infer<typeof requestReviewMessageSchema>;

export const listReviewersMessageSchema = z.object({
  type: z.literal(LIST_REVIEWERS),
  query: z.string().check(z.maxLength(100)),
});

export type ListReviewersMessage = z.infer<typeof listReviewersMessageSchema>;

export type RequestReviewReply = { ok: true; outcome: ReviewRequestOutcome } | { ok: false; error: string };

const listSentence = (prefix: string, logins: string[], suffix = "") =>
  logins.length > 0 ? `${prefix}${logins.join(", ")}.${suffix}` : "";

export const describeOutcome = (outcome: ReviewRequestOutcome): string =>
  [
    outcome.added.length > 0 ? listSentence("Requested ", outcome.added) : "Nobody new to request.",
    listSentence("Already requested: ", outcome.alreadyRequested),
    listSentence("Not available to review: ", outcome.unavailable),
    listSentence("Not a reviewer option on this PR: ", outcome.notFound),
    listSentence("No longer on GitHub: ", outcome.gone, " Remove them from your groups."),
    listSentence("GitHub did not confirm: ", outcome.unconfirmed, " Check the pull request."),
  ]
    .filter((sentence) => sentence.length > 0)
    .join(" ");

export const describeReply = (reply: RequestReviewReply): string =>
  reply.ok ? describeOutcome(reply.outcome) : reply.error;
