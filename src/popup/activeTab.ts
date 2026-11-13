import * as z from "zod/mini";
import { memberSchema } from "../groups/group";
import {
  LIST_REVIEWERS,
  REQUEST_REVIEW,
  type ListReviewersMessage,
  type ListReviewersReply,
  type RequestReviewMessage,
  type RequestReviewReply,
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
      gone: z.array(z.string()),
    }),
  }),
  failureSchema,
]);

const candidatesReplySchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), candidates: z.array(z.unknown()) }),
  failureSchema,
]);

const candidateSchema = z.object({
  login: memberSchema,
  description: z.string(),
  avatarUrl: z.nullable(z.string()),
  team: z.boolean(),
  requested: z.boolean(),
  available: z.boolean(),
  reviewState: z.nullable(z.enum(["approved", "changesRequested", "commented"])),
});

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
  return { ok: true, candidates };
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

export const requestReviewInTab = (tabId: number, members: string[]): Promise<RequestReviewReply> => {
  const message: RequestReviewMessage = { type: REQUEST_REVIEW, members };
  return sendToPicker(tabId, message).then(parseReply, tabUnreachable);
};

export const listReviewersInTab = (tabId: number, query: string): Promise<ListReviewersReply> => {
  const message: ListReviewersMessage = { type: LIST_REVIEWERS, query };
  return sendToPicker(tabId, message).then(parseCandidatesReply, tabUnreachable);
};
