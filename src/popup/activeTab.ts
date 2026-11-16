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
} from "../messages";

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

export const parseCountReply = parseOr<CountOpenRequestsReply>(
  countOpenRequestsReplySchema,
  COUNTS_UNAVAILABLE,
);

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
