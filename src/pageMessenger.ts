import { defineExtensionMessaging } from "@webext-core/messaging";
import type {
  COUNT_OPEN_REQUESTS,
  CountOpenRequestsMessage,
  CountOpenRequestsReply,
  LIST_REVIEWERS,
  ListReviewersMessage,
  ListReviewersReply,
  LOOK_UP_GROUP,
  LookUpGroupMessage,
  LookUpGroupReply,
  REMOVE_REVIEWERS,
  RemoveReviewersMessage,
  RemoveReviewersReply,
  REQUEST_REVIEW,
  RequestReviewMessage,
  RequestReviewReply,
} from "./messages";

export interface PageProtocol {
  [REQUEST_REVIEW](message: RequestReviewMessage): RequestReviewReply;
  [LIST_REVIEWERS](message: ListReviewersMessage): ListReviewersReply;
  [COUNT_OPEN_REQUESTS](message: CountOpenRequestsMessage): CountOpenRequestsReply;
  [LOOK_UP_GROUP](message: LookUpGroupMessage): LookUpGroupReply;
  [REMOVE_REVIEWERS](message: RemoveReviewersMessage): RemoveReviewersReply;
}

export const pageMessenger = defineExtensionMessaging<PageProtocol>();

const PAGE_COULD_NOT_FINISH = "PageCouldNotFinishError";

export class PageCouldNotFinishError extends Error {
  override readonly name = PAGE_COULD_NOT_FINISH;
  constructor(cause: unknown) {
    super(`The page could not finish: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

export const isPageFailure = (error: unknown): error is Error =>
  error instanceof Error && error.name === PAGE_COULD_NOT_FINISH;
