import { useEffect, useSyncExternalStore } from "react";
import { isPersonLogin } from "../groups/group";
import type { CountSnapshot, OpenRequestCounter } from "./openRequestCounter";
import type { Reviewers } from "./useReviewerList";

const MOST_PEOPLE_COUNTED_ON_OPEN = 10;

const countablePeopleShown = (reviewers: Reviewers): string[] =>
  reviewers.state === "ready" && reviewers.query === ""
    ? reviewers.candidates
        .filter((candidate) => !candidate.team && isPersonLogin(candidate.login))
        .slice(0, MOST_PEOPLE_COUNTED_ON_OPEN)
        .map((candidate) => candidate.login)
    : [];

export const useOpenRequestCounts = (counter: OpenRequestCounter, reviewers: Reviewers): CountSnapshot => {
  const snapshot = useSyncExternalStore(counter.subscribe, counter.snapshot);
  const shown = countablePeopleShown(reviewers).join(" ");

  useEffect(() => {
    for (const login of shown.split(" ").filter((part) => part.length > 0)) void counter.count(login);
  }, [counter, shown]);

  return snapshot;
};
