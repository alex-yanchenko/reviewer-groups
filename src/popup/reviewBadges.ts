import type { ReviewState } from "../messages";

export const REVIEW_BADGES: Record<ReviewState, { label: string; className: string }> = {
  approved: { label: "approved", className: "badge badge-done" },
  changesRequested: { label: "changes requested", className: "badge badge-warn" },
  commented: { label: "commented", className: "badge" },
};
