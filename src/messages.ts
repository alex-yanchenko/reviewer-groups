import * as z from "zod/mini";
import { isPersonLogin, memberSchema } from "./groups/group";
import { trustedAvatarUrl } from "./popup/avatar";

export const REQUEST_REVIEW = "request-review";
export const LIST_REVIEWERS = "list-reviewers";
export const COUNT_OPEN_REQUESTS = "count-open-requests";
export const LOOK_UP_GROUP = "look-up-group";
export const REMOVE_REVIEWERS = "remove-reviewers";

const popupSessionSchema = z.string().check(z.minLength(1), z.maxLength(100));

const pullRequestReferenceSchema = z.string().check(z.regex(/^[^/\s#]+\/[^/\s#]+#\d+$/));

export const requestReviewMessageSchema = z.object({
  session: popupSessionSchema,
  pullRequest: pullRequestReferenceSchema,
  members: z.array(memberSchema).check(z.minLength(1)),
});

export type RequestReviewMessage = z.infer<typeof requestReviewMessageSchema>;

export const listReviewersMessageSchema = z.object({
  session: popupSessionSchema,
  query: z.string().check(z.maxLength(100)),
});

export type ListReviewersMessage = z.infer<typeof listReviewersMessageSchema>;

export const countOpenRequestsMessageSchema = z.object({
  session: popupSessionSchema,
  login: memberSchema.check(z.refine(isPersonLogin)),
});

export type CountOpenRequestsMessage = z.infer<typeof countOpenRequestsMessageSchema>;

export const lookUpGroupMessageSchema = z.object({
  session: popupSessionSchema,
  members: z.array(memberSchema).check(z.minLength(1)),
});

export type LookUpGroupMessage = z.infer<typeof lookUpGroupMessageSchema>;

export const removeReviewersMessageSchema = z.object({
  session: popupSessionSchema,
  pullRequest: pullRequestReferenceSchema,
  members: z.array(memberSchema).check(z.minLength(1)),
});

export type RemoveReviewersMessage = z.infer<typeof removeReviewersMessageSchema>;

export const reviewStateSchema = z.enum(["approved", "changesRequested", "commented"]);

export type ReviewState = z.infer<typeof reviewStateSchema>;

const avatarFromGitHubSchema = z.pipe(z.nullable(z.string()), z.transform(trustedAvatarUrl));

export const reviewerCandidateSchema = z.object({
  login: memberSchema,
  description: z.string(),
  avatarUrl: avatarFromGitHubSchema,
  team: z.boolean(),
  requested: z.boolean(),
  available: z.boolean(),
  reviewState: z.nullable(reviewStateSchema),
});

export type ReviewerCandidate = z.infer<typeof reviewerCandidateSchema>;

const reviewedPersonSchema = z.object({
  login: memberSchema,
  reviewState: reviewStateSchema,
  requested: z.boolean(),
});

export type ReviewedPerson = z.infer<typeof reviewedPersonSchema>;

const readableEntries =
  <Entry>(entry: z.ZodMiniType<Entry>) =>
  (raw: unknown[]): Entry[] =>
    raw.flatMap((item) => {
      const result = entry.safeParse(item);
      return result.success ? [result.data] : [];
    });

const someReadable =
  (entry: z.ZodMiniType) =>
  (raw: unknown[]): boolean =>
    raw.length === 0 || raw.some((item) => entry.safeParse(item).success);

const reviewerListSchema = z.object({
  candidates: z.pipe(
    z.array(z.unknown()).check(z.refine(someReadable(reviewerCandidateSchema))),
    z.transform(readableEntries(reviewerCandidateSchema)),
  ),
  reviewed: z._default(z.pipe(z.array(z.unknown()), z.transform(readableEntries(reviewedPersonSchema))), []),
});

export type ReviewerList = z.infer<typeof reviewerListSchema>;

const memberLookupSchema = z.object({
  member: memberSchema,
  candidate: z.nullable(reviewerCandidateSchema),
});

const groupLookupSchema = z.object({
  author: z.nullable(z.string()),
  members: z.array(memberLookupSchema),
});

export type GroupLookup = z.infer<typeof groupLookupSchema>;

const loginsSchema = z.array(z.string());

const reviewRequestOutcomeSchema = z.object({
  added: loginsSchema,
  alreadyRequested: loginsSchema,
  unavailable: loginsSchema,
  notFound: loginsSchema,
  unconfirmed: loginsSchema,
  dropped: loginsSchema,
  gone: loginsSchema,
});

export type ReviewRequestOutcome = z.infer<typeof reviewRequestOutcomeSchema>;

const removalOutcomeSchema = z.object({
  removed: loginsSchema,
  notRequested: loginsSchema,
  unconfirmed: loginsSchema,
  dropped: loginsSchema,
});

export type RemovalOutcome = z.infer<typeof removalOutcomeSchema>;

const succeeded = z.literal(true);

const failureSchema = z.object({ ok: z.literal(false), error: z.string() });

export const requestReviewReplySchema = z.discriminatedUnion("ok", [
  z.object({ ok: succeeded, outcome: reviewRequestOutcomeSchema }),
  failureSchema,
]);

export type RequestReviewReply = z.infer<typeof requestReviewReplySchema>;

export const listReviewersReplySchema = z.discriminatedUnion("ok", [
  z.extend(reviewerListSchema, { ok: succeeded }),
  failureSchema,
]);

export type ListReviewersReply = z.infer<typeof listReviewersReplySchema>;

export const lookUpGroupReplySchema = z.discriminatedUnion("ok", [
  z.extend(groupLookupSchema, { ok: succeeded }),
  failureSchema,
]);

export type LookUpGroupReply = z.infer<typeof lookUpGroupReplySchema>;

export const removeReviewersReplySchema = z.discriminatedUnion("ok", [
  z.object({ ok: succeeded, outcome: removalOutcomeSchema }),
  failureSchema,
]);

export type RemoveReviewersReply = z.infer<typeof removeReviewersReplySchema>;

export const countOpenRequestsReplySchema = z.discriminatedUnion("ok", [
  z.object({ ok: succeeded, count: z.int().check(z.nonnegative()) }),
  z.extend(failureSchema, { limited: z.boolean() }),
]);

export type CountOpenRequestsReply = z.infer<typeof countOpenRequestsReplySchema>;

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
    listSentence("GitHub also removed: ", outcome.dropped, " Check the pull request."),
  ]);

export const describeOutcome = (outcome: ReviewRequestOutcome): string =>
  joinSentences([
    outcome.added.length > 0 ? listSentence("Requested ", outcome.added) : "Nobody new to request.",
    listSentence("Already requested: ", outcome.alreadyRequested),
    describeOutcomeProblems(outcome),
  ]);

export const describeRemoval = (outcome: RemovalOutcome): string =>
  joinSentences([
    outcome.removed.length > 0 ? listSentence("Removed ", outcome.removed) : "Nobody was removed.",
    listSentence("No longer requested: ", outcome.notRequested),
    listSentence("GitHub did not confirm removing: ", outcome.unconfirmed, " Check the pull request."),
    listSentence("GitHub also removed: ", outcome.dropped, " Check the pull request."),
  ]);

export const describeReply = (reply: RequestReviewReply): string =>
  reply.ok ? describeOutcome(reply.outcome) : reply.error;
