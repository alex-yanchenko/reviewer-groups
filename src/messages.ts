import * as z from "zod/mini";
import type {
  GroupLookup,
  MemberLookup,
  ReviewedPerson,
  ReviewerCandidate,
  ReviewerList,
  ReviewRequestOutcome,
  ReviewState,
} from "./content/githubReviewers";
import { isPersonLogin, memberSchema } from "./groups/group";

export type {
  GroupLookup,
  MemberLookup,
  ReviewedPerson,
  ReviewerCandidate,
  ReviewerList,
  ReviewRequestOutcome,
  ReviewState,
};

export const REQUEST_REVIEW = "request-review";
export const LIST_REVIEWERS = "list-reviewers";

export type ListReviewersReply = ({ ok: true } & ReviewerList) | { ok: false; error: string };

const popupSessionSchema = z.string().check(z.minLength(1), z.maxLength(100));

export const requestReviewMessageSchema = z.object({
  type: z.literal(REQUEST_REVIEW),
  session: popupSessionSchema,
  members: z.array(memberSchema).check(z.minLength(1)),
});

export type RequestReviewMessage = z.infer<typeof requestReviewMessageSchema>;

export const listReviewersMessageSchema = z.object({
  type: z.literal(LIST_REVIEWERS),
  session: popupSessionSchema,
  query: z.string().check(z.maxLength(100)),
});

export type ListReviewersMessage = z.infer<typeof listReviewersMessageSchema>;

export const COUNT_OPEN_REQUESTS = "count-open-requests";

export const countOpenRequestsMessageSchema = z.object({
  type: z.literal(COUNT_OPEN_REQUESTS),
  session: popupSessionSchema,
  login: memberSchema.check(z.refine(isPersonLogin)),
});

export type CountOpenRequestsMessage = z.infer<typeof countOpenRequestsMessageSchema>;

export type CountOpenRequestsReply =
  { ok: true; count: number } | { ok: false; error: string; limited: boolean };

export const LOOK_UP_GROUP = "look-up-group";

export const lookUpGroupMessageSchema = z.object({
  type: z.literal(LOOK_UP_GROUP),
  session: popupSessionSchema,
  members: z.array(memberSchema).check(z.minLength(1)),
});

export type LookUpGroupMessage = z.infer<typeof lookUpGroupMessageSchema>;

export type LookUpGroupReply = ({ ok: true } & GroupLookup) | { ok: false; error: string };

export type RequestReviewReply = { ok: true; outcome: ReviewRequestOutcome } | { ok: false; error: string };

export const listSentence = (prefix: string, logins: string[], suffix = "") =>
  logins.length > 0 ? `${prefix}${logins.join(", ")}.${suffix}` : "";

export const joinSentences = (sentences: string[]): string =>
  sentences.filter((sentence) => sentence.length > 0).join(" ");

export const describeOutcomeProblems = (outcome: ReviewRequestOutcome): string =>
  joinSentences([
    listSentence("Not available to review: ", outcome.unavailable),
    listSentence("Not a reviewer option on this PR: ", outcome.notFound),
    listSentence("No longer on GitHub: ", outcome.gone, " Remove them from your groups."),
    listSentence("GitHub did not confirm: ", outcome.unconfirmed, " Check the pull request."),
  ]);

export const describeOutcome = (outcome: ReviewRequestOutcome): string =>
  joinSentences([
    outcome.added.length > 0 ? listSentence("Requested ", outcome.added) : "Nobody new to request.",
    listSentence("Already requested: ", outcome.alreadyRequested),
    describeOutcomeProblems(outcome),
  ]);

export const describeReply = (reply: RequestReviewReply): string =>
  reply.ok ? describeOutcome(reply.outcome) : reply.error;
