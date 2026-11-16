import * as z from "zod/mini";
import { memberSchema } from "../groups/group";
import {
  COUNT_OPEN_REQUESTS,
  LIST_REVIEWERS,
  LOOK_UP_GROUP,
  REMOVE_REVIEWERS,
  REQUEST_REVIEW,
  type CountOpenRequestsMessage,
  type CountOpenRequestsReply,
  type ListReviewersMessage,
  type ListReviewersReply,
  type LookUpGroupMessage,
  type LookUpGroupReply,
  type RemoveReviewersMessage,
  type RemoveReviewersReply,
  type RequestReviewMessage,
  type RequestReviewReply,
  type ReviewedPerson,
  type ReviewerCandidate,
} from "../messages";
import { trustedAvatarUrl } from "./avatar";

const PULL_REQUEST_URL = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)(?:[/?#]|$)/;

const PICKER_SCRIPT = "picker.js";

const UNEXPECTED_ANSWER = { ok: false, error: "The page sent back an unexpected answer." } as const;

const failureSchema = z.object({ ok: z.literal(false), error: z.string() });

const replySchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    outcome: z.object({
      added: z.array(z.string()),
      alreadyRequested: z.array(z.string()),
      unavailable: z.array(z.string()),
      notFound: z.array(z.string()),
      unconfirmed: z.array(z.string()),
      dropped: z.array(z.string()),
      gone: z.array(z.string()),
    }),
  }),
  failureSchema,
]);

const candidatesReplySchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    candidates: z.array(z.unknown()),
    reviewed: z.optional(z.array(z.unknown())),
  }),
  failureSchema,
]);

const reviewStateSchema = z.enum(["approved", "changesRequested", "commented"]);

const candidateSchema = z.object({
  login: memberSchema,
  description: z.string(),
  avatarUrl: z.nullable(z.string()),
  team: z.boolean(),
  requested: z.boolean(),
  available: z.boolean(),
  reviewState: z.nullable(reviewStateSchema),
});

const reviewedPersonSchema = z.object({
  login: memberSchema,
  reviewState: reviewStateSchema,
  requested: z.boolean(),
});

const parseReviewedPerson = (raw: unknown): ReviewedPerson[] => {
  const result = reviewedPersonSchema.safeParse(raw);
  return result.success ? [result.data] : [];
};

export const describePullRequest = (url: string | undefined): string | null => {
  const match = url === undefined ? null : PULL_REQUEST_URL.exec(url);
  return match ? `${match[1]}#${match[2]}` : null;
};

export const parseReply = (raw: unknown): RequestReviewReply => {
  const result = replySchema.safeParse(raw);
  return result.success ? result.data : UNEXPECTED_ANSWER;
};

const parseCandidate = (raw: unknown): ReviewerCandidate[] => {
  const result = candidateSchema.safeParse(raw);
  return result.success ? [{ ...result.data, avatarUrl: trustedAvatarUrl(result.data.avatarUrl) }] : [];
};

export const parseCandidatesReply = (raw: unknown): ListReviewersReply => {
  const result = candidatesReplySchema.safeParse(raw);
  if (!result.success) return UNEXPECTED_ANSWER;
  if (!result.data.ok) return result.data;
  const candidates = result.data.candidates.flatMap(parseCandidate);
  if (result.data.candidates.length > 0 && candidates.length === 0) return UNEXPECTED_ANSWER;
  return { ok: true, candidates, reviewed: (result.data.reviewed ?? []).flatMap(parseReviewedPerson) };
};

const lookUpReplySchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    author: z.nullable(z.string()),
    members: z.array(z.object({ member: memberSchema, candidate: z.nullable(candidateSchema) })),
  }),
  failureSchema,
]);

export const parseLookUpReply = (raw: unknown): LookUpGroupReply => {
  const result = lookUpReplySchema.safeParse(raw);
  if (!result.success) return UNEXPECTED_ANSWER;
  if (!result.data.ok) return result.data;
  return {
    ...result.data,
    members: result.data.members.map(({ member, candidate }) => ({
      member,
      candidate:
        candidate === null ? null : { ...candidate, avatarUrl: trustedAvatarUrl(candidate.avatarUrl) },
    })),
  };
};

const removeReplySchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    outcome: z.object({
      removed: z.array(z.string()),
      notRequested: z.array(z.string()),
      unconfirmed: z.array(z.string()),
      dropped: z.array(z.string()),
    }),
  }),
  failureSchema,
]);

export const parseRemoveReply = (raw: unknown): RemoveReviewersReply => {
  const result = removeReplySchema.safeParse(raw);
  return result.success ? result.data : UNEXPECTED_ANSWER;
};

export interface ActiveTab {
  id: number;
  pullRequest: string | null;
}

export const readActiveTab = async (): Promise<ActiveTab | null> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  return { id: tab.id, pullRequest: describePullRequest(tab.url) };
};

const tabUnreachable = (error: unknown) => ({
  ok: false as const,
  error: `Chrome could not reach this tab (${error instanceof Error ? error.message : String(error)}). Reload the pull request and try again.`,
});

const injectPickerAndSend = async (tabId: number, message: unknown): Promise<unknown> => {
  await chrome.scripting.executeScript({ target: { tabId }, files: [PICKER_SCRIPT] });
  return chrome.tabs.sendMessage(tabId, message);
};

const sendToPicker = (tabId: number, message: unknown): Promise<unknown> =>
  chrome.tabs.sendMessage(tabId, message).catch(() => injectPickerAndSend(tabId, message));

export interface PopupTab {
  id: number;
  session: string;
}

export const requestReviewInTab = (
  { id, session }: PopupTab,
  pullRequest: string,
  members: string[],
): Promise<RequestReviewReply> => {
  const message: RequestReviewMessage = { type: REQUEST_REVIEW, session, pullRequest, members };
  return sendToPicker(id, message).then(parseReply, tabUnreachable);
};

const countReplySchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), count: z.int().check(z.nonnegative()) }),
  z.object({ ok: z.literal(false), error: z.string(), limited: z.boolean() }),
]);

export const parseCountReply = (raw: unknown): CountOpenRequestsReply => {
  const result = countReplySchema.safeParse(raw);
  return result.success ? result.data : { ok: false, error: "Counts unavailable.", limited: false };
};

export const removeReviewersInTab = (
  { id, session }: PopupTab,
  pullRequest: string,
  members: string[],
): Promise<RemoveReviewersReply> => {
  const message: RemoveReviewersMessage = { type: REMOVE_REVIEWERS, session, pullRequest, members };
  return sendToPicker(id, message).then(parseRemoveReply, tabUnreachable);
};

export const lookUpGroupInTab = ({ id, session }: PopupTab, members: string[]): Promise<LookUpGroupReply> => {
  const message: LookUpGroupMessage = { type: LOOK_UP_GROUP, session, members };
  return sendToPicker(id, message).then(parseLookUpReply, tabUnreachable);
};

export const countOpenRequestsInTab = (
  { id, session }: PopupTab,
  login: string,
): Promise<CountOpenRequestsReply> => {
  const message: CountOpenRequestsMessage = { type: COUNT_OPEN_REQUESTS, session, login };
  return sendToPicker(id, message).then(parseCountReply, (error: unknown) => ({
    ...tabUnreachable(error),
    limited: false,
  }));
};

export const listReviewersInTab = ({ id, session }: PopupTab, query: string): Promise<ListReviewersReply> => {
  const message: ListReviewersMessage = { type: LIST_REVIEWERS, session, query };
  return sendToPicker(id, message).then(parseCandidatesReply, tabUnreachable);
};
