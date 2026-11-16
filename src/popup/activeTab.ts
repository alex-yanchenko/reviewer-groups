import type * as z from "zod/mini";
import {
  COUNT_OPEN_REQUESTS,
  countOpenRequestsReplySchema,
  LIST_REVIEWERS,
  listReviewersReplySchema,
  LOOK_UP_GROUP,
  lookUpGroupReplySchema,
  REMOVE_REVIEWERS,
  removeReviewersReplySchema,
  REQUEST_REVIEW,
  requestReviewReplySchema,
  type CountOpenRequestsReply,
  type ListReviewersReply,
  type LookUpGroupReply,
  type RemoveReviewersReply,
  type RequestReviewReply,
} from "../messages";
import { isPageFailure, pageMessenger } from "../pageMessenger";

const PULL_REQUEST_URL = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)(?:[/?#]|$)/;

const PICKER_SCRIPT = "picker.js";

const UNEXPECTED_ANSWER = { ok: false, error: "The page sent back an unexpected answer." } as const;

const COUNTS_UNAVAILABLE = { ok: false, error: "Counts unavailable.", limited: false } as const;

const parseOr =
  <Reply>(schema: z.ZodMiniType<Reply>, fallback: Reply) =>
  (raw: unknown): Reply => {
    const result = schema.safeParse(raw);
    return result.success ? result.data : fallback;
  };

export const describePullRequest = (url: string | undefined): string | null => {
  const match = url === undefined ? null : PULL_REQUEST_URL.exec(url);
  return match ? `${match[1]}#${match[2]}` : null;
};

export const parseReply = parseOr<RequestReviewReply>(requestReviewReplySchema, UNEXPECTED_ANSWER);

export const parseCandidatesReply = parseOr<ListReviewersReply>(listReviewersReplySchema, UNEXPECTED_ANSWER);

export const parseLookUpReply = parseOr<LookUpGroupReply>(lookUpGroupReplySchema, UNEXPECTED_ANSWER);

export const parseRemoveReply = parseOr<RemoveReviewersReply>(removeReviewersReplySchema, UNEXPECTED_ANSWER);

export const parseCountReply = parseOr<CountOpenRequestsReply>(
  countOpenRequestsReplySchema,
  COUNTS_UNAVAILABLE,
);

export interface ActiveTab {
  id: number;
  pullRequest: string | null;
}

export const readActiveTab = async (): Promise<ActiveTab | null> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  return { id: tab.id, pullRequest: describePullRequest(tab.url) };
};

const describeFailureToAnswer = (error: unknown) => ({
  ok: false as const,
  error: isPageFailure(error)
    ? error.message
    : `Chrome could not reach this tab (${error instanceof Error ? error.message : String(error)}). Reload the pull request and try again.`,
});

const sendToPicker = (tabId: number, send: () => Promise<unknown>): Promise<unknown> =>
  send().catch(async (error: unknown) => {
    if (isPageFailure(error)) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: [PICKER_SCRIPT] });
    return send();
  });

export interface PopupTab {
  id: number;
  session: string;
}

export const requestReviewInTab = (
  { id, session }: PopupTab,
  pullRequest: string,
  members: string[],
): Promise<RequestReviewReply> =>
  sendToPicker(id, () =>
    pageMessenger.sendMessage(REQUEST_REVIEW, { session, pullRequest, members }, id),
  ).then(parseReply, describeFailureToAnswer);

export const removeReviewersInTab = (
  { id, session }: PopupTab,
  pullRequest: string,
  members: string[],
): Promise<RemoveReviewersReply> =>
  sendToPicker(id, () =>
    pageMessenger.sendMessage(REMOVE_REVIEWERS, { session, pullRequest, members }, id),
  ).then(parseRemoveReply, describeFailureToAnswer);

export const lookUpGroupInTab = ({ id, session }: PopupTab, members: string[]): Promise<LookUpGroupReply> =>
  sendToPicker(id, () => pageMessenger.sendMessage(LOOK_UP_GROUP, { session, members }, id)).then(
    parseLookUpReply,
    describeFailureToAnswer,
  );

export const countOpenRequestsInTab = (
  { id, session }: PopupTab,
  login: string,
): Promise<CountOpenRequestsReply> =>
  sendToPicker(id, () => pageMessenger.sendMessage(COUNT_OPEN_REQUESTS, { session, login }, id)).then(
    parseCountReply,
    (error: unknown) =>
      isPageFailure(error) ? COUNTS_UNAVAILABLE : { ...describeFailureToAnswer(error), limited: false },
  );

export const listReviewersInTab = ({ id, session }: PopupTab, query: string): Promise<ListReviewersReply> =>
  sendToPicker(id, () => pageMessenger.sendMessage(LIST_REVIEWERS, { session, query }, id)).then(
    parseCandidatesReply,
    describeFailureToAnswer,
  );
