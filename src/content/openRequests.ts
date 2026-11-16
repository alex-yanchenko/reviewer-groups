import * as z from "zod/mini";
import { GitHubAnswerError, type GitHubPage } from "./githubPage";

const TOO_MANY_REQUESTS = 429;

export class SearchLimitedError extends Error {
  override readonly name = "SearchLimitedError";
  constructor() {
    super("GitHub is limiting searches; counts paused.");
  }
}

export class SearchAnswerUnreadableError extends Error {
  override readonly name = "SearchAnswerUnreadableError";
  constructor() {
    super("Counts unavailable.");
  }
}

const searchAnswerSchema = z.object({
  payload: z.object({
    blackbirdSearchRoute: z.object({ result_count: z.int().check(z.nonnegative()) }),
  }),
});

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    throw new SearchAnswerUnreadableError();
  }
};

export const countOpenReviewRequests = async ({ doc, fetch }: GitHubPage, login: string): Promise<number> => {
  const url = new URL("/search", doc.location.origin);
  url.searchParams.set("type", "pullrequests");
  url.searchParams.set("q", `is:pr is:open review-requested:${login} archived:false`);
  const response = await fetch(url.href, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (response.status === TOO_MANY_REQUESTS) throw new SearchLimitedError();
  if (!response.ok) throw new GitHubAnswerError(response.status);
  const answer = searchAnswerSchema.safeParse(await readJson(response));
  if (!answer.success) throw new SearchAnswerUnreadableError();
  return answer.data.payload.blackbirdSearchRoute.result_count;
};
