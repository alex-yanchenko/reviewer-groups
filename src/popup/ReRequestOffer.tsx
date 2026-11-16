import { useState } from "react";
import type { ReviewedPerson } from "../messages";
import { REVIEW_BADGES } from "./reviewBadges";

const describeReviews = (people: ReviewedPerson[]) =>
  `Reviewed: ${people.map(({ login, reviewState }) => `${login} (${REVIEW_BADGES[reviewState].label})`).join(", ")}.`;

export function ReRequestOffer({
  reviewed,
  busy,
  locked,
  onReRequest,
}: {
  reviewed: ReviewedPerson[];
  busy: boolean;
  locked: boolean;
  onReRequest: (logins: string[]) => void;
}) {
  const [includeApprovers, setIncludeApprovers] = useState(false);
  const waiting = reviewed.filter((person) => !person.requested);
  if (waiting.length === 0) return null;
  const approvers = waiting.filter((person) => person.reviewState === "approved");
  const chosen = includeApprovers ? waiting : waiting.filter((person) => person.reviewState !== "approved");

  return (
    <section className="panel" aria-label="Re-request reviews">
      {chosen.length > 0 && <p>{describeReviews(chosen)}</p>}
      <div className="actions">
        {approvers.length > 0 && (
          <label className="check">
            <input
              type="checkbox"
              checked={includeApprovers}
              onChange={(event) => setIncludeApprovers(event.target.checked)}
            />
            Include {approvers.length} who approved
          </label>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={locked || chosen.length === 0}
          onClick={() => onReRequest(chosen.map((person) => person.login))}
        >
          {busy ? "Requesting…" : `Re-request ${chosen.length} who reviewed`}
        </button>
      </div>
    </section>
  );
}
