import { useCallback, useEffect, useState } from "react";
import type { ListReviewersReply, ReviewedPerson, ReviewerCandidate } from "../messages";

export type Reviewers =
  | { state: "absent" }
  | { state: "loading" }
  | {
      state: "ready";
      query: string;
      candidates: ReviewerCandidate[];
      reviewed: ReviewedPerson[];
      problem: string;
    }
  | { state: "failed"; error: string };

const SEARCH_DEBOUNCE_MS = 250;

const reviewersAfterReply = (previous: Reviewers, query: string, reply: ListReviewersReply): Reviewers => {
  if (reply.ok) {
    return { state: "ready", query, candidates: reply.candidates, reviewed: reply.reviewed, problem: "" };
  }
  if (previous.state === "ready") return { ...previous, problem: reply.error };
  return { state: "failed", error: reply.error };
};

export const useReviewerList = ({
  listReviewers,
  pullRequest,
  search,
  ready,
  onFound,
}: {
  listReviewers: (query: string) => Promise<ListReviewersReply>;
  pullRequest: string | null;
  search: string;
  ready: boolean;
  onFound: (candidates: ReviewerCandidate[]) => void;
}) => {
  const [reviewers, setReviewers] = useState<Reviewers>({ state: pullRequest ? "loading" : "absent" });
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!pullRequest || !ready) return;
    let stillWanted = true;
    const query = search.trim();
    const timer = setTimeout(
      () => {
        void listReviewers(query).then((reply) => {
          if (!stillWanted) return;
          setReviewers((previous) => reviewersAfterReply(previous, query, reply));
          if (reply.ok) onFound(reply.candidates);
        });
      },
      query === "" ? 0 : SEARCH_DEBOUNCE_MS,
    );
    return () => {
      stillWanted = false;
      clearTimeout(timer);
    };
  }, [listReviewers, pullRequest, search, ready, onFound, round]);

  const readAgain = useCallback(() => setRound((previous) => previous + 1), []);

  return { reviewers, readAgain };
};
