import { useEffect, useRef } from "react";
import { isPersonLogin } from "../groups/group";
import type { Reviewers } from "./useReviewerList";

export const requestedHere = (reviewers: Reviewers): string[] =>
  reviewers.state === "ready" && reviewers.query === ""
    ? reviewers.candidates
        .filter((candidate) => candidate.requested && (candidate.team || isPersonLogin(candidate.login)))
        .map((candidate) => candidate.login)
    : [];

export const useFirstRunTicks = ({
  active,
  reviewers,
  draftReady,
  alreadyTicked,
  tick,
}: {
  active: boolean;
  reviewers: Reviewers;
  draftReady: boolean;
  alreadyTicked: boolean;
  tick: (logins: string[]) => void;
}): void => {
  const done = useRef(false);

  useEffect(() => {
    if (done.current || alreadyTicked || !active || !draftReady || reviewers.state !== "ready") return;
    done.current = true;
    tick(requestedHere(reviewers));
  }, [active, reviewers, draftReady, alreadyTicked, tick]);
};

export function FirstRunIntro({ onPullRequest, ticked }: { onPullRequest: boolean; ticked: number }) {
  return (
    <section className="panel" aria-label="Getting started">
      <p>Tick people and request them in one click.</p>
      <p>Save the people you ask often as a group: next time it is the toolbar icon, then the group.</p>
      {onPullRequest && ticked > 0 && (
        <p className="hint">The {ticked} already requested here are ticked, so Save as group keeps them.</p>
      )}
      {!onPullRequest && (
        <p className="hint">
          Open a pull request to see everyone you can request, or type logins with New group.
        </p>
      )}
    </section>
  );
}
