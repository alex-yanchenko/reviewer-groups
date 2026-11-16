import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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

interface ReviewerListing {
  query: string;
  candidates: ReviewerCandidate[];
  reviewed: ReviewedPerson[];
}

const REVIEWER_LIST = "reviewer-list";

const SEARCH_DEBOUNCE_MS = 250;

class ReviewerListUnreadableError extends Error {
  override readonly name = "ReviewerListUnreadableError";
}

const useSettledSearch = (search: string): string => {
  const [settled, setSettled] = useState(search.trim());
  useEffect(() => {
    const query = search.trim();
    const timer = setTimeout(() => setSettled(query), query === "" ? 0 : SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);
  return settled;
};

const lastListing = (queryClient: QueryClient, pullRequest: string | null): ReviewerListing | undefined => {
  const [latest] = queryClient
    .getQueryCache()
    .findAll({ queryKey: [REVIEWER_LIST, pullRequest], predicate: (query) => query.state.data !== undefined })
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  return latest === undefined ? undefined : queryClient.getQueryData<ReviewerListing>(latest.queryKey);
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
  const queryClient = useQueryClient();
  const query = useSettledSearch(search);
  const listed = useQuery({
    queryKey: [REVIEWER_LIST, pullRequest, query],
    queryFn: async ({ signal }): Promise<ReviewerListing> => {
      const reply = await listReviewers(query);
      if (!reply.ok) throw new ReviewerListUnreadableError(reply.error);
      if (!signal.aborted) onFound(reply.candidates);
      return { query, candidates: reply.candidates, reviewed: reply.reviewed };
    },
    enabled: pullRequest !== null && ready,
    placeholderData: keepPreviousData,
  });

  const listing = listed.data ?? lastListing(queryClient, pullRequest);
  const reviewers: Reviewers =
    listing !== undefined
      ? { state: "ready", ...listing, problem: listed.error?.message ?? "" }
      : listed.error !== null
        ? { state: "failed", error: listed.error.message }
        : { state: pullRequest ? "loading" : "absent" };

  const readAgain = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: [REVIEWER_LIST] }),
    [queryClient],
  );

  return { reviewers, readAgain };
};
