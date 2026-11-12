import * as z from "zod/mini";
import { REQUEST_REVIEW, type RequestReviewMessage, type RequestReviewReply } from "../messages";

const PULL_REQUEST_URL = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)(?:[/?#]|$)/;

const PICKER_SCRIPT = "picker.js";

const replySchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    outcome: z.object({
      added: z.array(z.string()),
      alreadyRequested: z.array(z.string()),
      notFound: z.array(z.string()),
    }),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const describePullRequest = (url: string | undefined): string | null => {
  const match = url === undefined ? null : PULL_REQUEST_URL.exec(url);
  return match ? `${match[1]}#${match[2]}` : null;
};

export const parseReply = (raw: unknown): RequestReviewReply => {
  const result = replySchema.safeParse(raw);
  return result.success ? result.data : { ok: false, error: "The page sent back an unexpected answer." };
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

export const requestReviewInTab = async (tabId: number, members: string[]): Promise<RequestReviewReply> => {
  const message: RequestReviewMessage = { type: REQUEST_REVIEW, members };
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [PICKER_SCRIPT] });
    return parseReply(await chrome.tabs.sendMessage(tabId, message));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Chrome could not reach this tab (${reason}). Reload the pull request and try again.`,
    };
  }
};
