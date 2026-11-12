import * as z from "zod/mini";
import { memberSchema } from "../groups/group";
import {
  LIST_REVIEWERS,
  REQUEST_REVIEW,
  type ListReviewersReply,
  type RequestReviewMessage,
  type RequestReviewReply,
  type ReviewerCandidate,
} from "../messages";

const PULL_REQUEST_URL = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)(?:[/?#]|$)/;

const PICKER_SCRIPT = "picker.js";

const AVATAR_HOST = "avatars.githubusercontent.com";

const UNEXPECTED_ANSWER = { ok: false, error: "The page sent back an unexpected answer." } as const;

const failureSchema = z.object({ ok: z.literal(false), error: z.string() });

const replySchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    outcome: z.object({
      added: z.array(z.string()),
      alreadyRequested: z.array(z.string()),
      notFound: z.array(z.string()),
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
});

export const describePullRequest = (url: string | undefined): string | null => {
  const match = url === undefined ? null : PULL_REQUEST_URL.exec(url);
  return match ? `${match[1]}#${match[2]}` : null;
};

export const parseReply = (raw: unknown): RequestReviewReply => {
  const result = replySchema.safeParse(raw);
  return result.success ? result.data : UNEXPECTED_ANSWER;
};

const isGitHubAvatar = (url: string) => {
  const parsed = URL.parse(url);
  return parsed !== null && parsed.protocol === "https:" && parsed.hostname === AVATAR_HOST;
};

const parseCandidate = (raw: unknown): ReviewerCandidate[] => {
  const result = candidateSchema.safeParse(raw);
  if (!result.success) return [];
  const { avatarUrl } = result.data;
  return [{ ...result.data, avatarUrl: avatarUrl !== null && isGitHubAvatar(avatarUrl) ? avatarUrl : null }];
};

export const parseCandidatesReply = (raw: unknown): ListReviewersReply => {
  const result = candidatesReplySchema.safeParse(raw);
  if (!result.success) return UNEXPECTED_ANSWER;
  if (!result.data.ok) return result.data;
  return { ok: true, candidates: result.data.candidates.flatMap(parseCandidate) };
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

const sendToPicker = async (tabId: number, message: unknown): Promise<unknown> => {
  await chrome.scripting.executeScript({ target: { tabId }, files: [PICKER_SCRIPT] });
  return chrome.tabs.sendMessage(tabId, message);
};

export const requestReviewInTab = (tabId: number, members: string[]): Promise<RequestReviewReply> => {
  const message: RequestReviewMessage = { type: REQUEST_REVIEW, members };
  return sendToPicker(tabId, message).then(parseReply, tabUnreachable);
};

export const listReviewersInTab = (tabId: number): Promise<ListReviewersReply> =>
  sendToPicker(tabId, { type: LIST_REVIEWERS }).then(parseCandidatesReply, tabUnreachable);
