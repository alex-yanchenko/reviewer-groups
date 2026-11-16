import { useEffect, useRef } from "react";
import { isPersonLogin } from "../groups/group";
import type { Draft } from "./draft";
import { isTicked } from "./selection";
import type { Reviewers } from "./useReviewerList";

export const requestedHere = (reviewers: Reviewers): string[] =>
  reviewers.state === "ready" && reviewers.query === ""
    ? reviewers.candidates
        .filter((candidate) => candidate.requested && (candidate.team || isPersonLogin(candidate.login)))
        .map((candidate) => candidate.login)
    : [];

export const loginsTickedHere = (draft: Draft, pullRequest: string | null): string[] =>
  draft.firstRunTicked?.pullRequest === pullRequest
    ? draft.firstRunTicked.logins.filter((login) => isTicked(draft.selection, login))
    : [];

export const useFirstRunTicks = ({
  active,
  reviewers,
  draftReady,
  pullRequest,
  tickedOn,
  tick,
}: {
  active: boolean;
  reviewers: Reviewers;
  draftReady: boolean;
  pullRequest: string | null;
  tickedOn: string | undefined;
  tick: (pullRequest: string, logins: string[]) => void;
}): void => {
  const done = useRef(false);

  useEffect(() => {
    if (done.current || pullRequest === null || tickedOn === pullRequest) return;
    if (!active || !draftReady || reviewers.state !== "ready") return;
    done.current = true;
    tick(pullRequest, requestedHere(reviewers));
  }, [active, reviewers, draftReady, pullRequest, tickedOn, tick]);
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
