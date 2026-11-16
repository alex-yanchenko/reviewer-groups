import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { Group } from "../../groups/group";
import type {
  CountOpenRequestsReply,
  ListReviewersReply,
  LookUpGroupReply,
  RemoveReviewersReply,
  RequestReviewReply,
  ReviewerCandidate,
  ReviewRequestOutcome,
} from "../../messages";
import { App, type DirectoryStore, type Draft, type DraftStore, type GroupStore } from "../App";
import { EMPTY_DIRECTORY, type Directory } from "../directory";
import { OpenRequestCounter } from "../openRequestCounter";
import type { AskedBefore, RotationStore } from "../rotation";

export const candidate = (login: string, overrides: Partial<ReviewerCandidate> = {}): ReviewerCandidate => ({
  login,
  description: "",
  avatarUrl: null,
  team: false,
  requested: false,
  available: true,
  reviewState: null,
  ...overrides,
});

export const outcome = (overrides: Partial<ReviewRequestOutcome>): ReviewRequestOutcome => ({
  added: [],
  alreadyRequested: [],
  unavailable: [],
  notFound: [],
  unconfirmed: [],
  gone: [],
  ...overrides,
});

export const reviewers: ReviewerCandidate[] = [
  candidate("mona", { description: "Mona Lisa", avatarUrl: "https://avatars.githubusercontent.com/u/101" }),
  candidate("hubot"),
  candidate("octocat", { requested: true }),
  candidate("acme/backend", { team: true, description: "API owners" }),
];

export const emptyDraft: Draft = { selection: [], editingGroupId: null };

export interface RenderOptions {
  groups?: Group[];
  unreadable?: number;
  loadFailure?: Error;
  saveFailure?: Error;
  pullRequest?: string | null;
  candidates?: ListReviewersReply;
  candidatesAfterRequest?: ListReviewersReply;
  searches?: Record<string, ReviewerCandidate[]>;
  draft?: Draft;
  draftLoad?: Promise<Draft>;
  directory?: Directory;
  requestReview?: (members: string[]) => Promise<RequestReviewReply>;
  openRequestCounts?: Record<string, number>;
  countReply?: (login: string) => Promise<CountOpenRequestsReply>;
  lookUpGroup?: (members: string[]) => Promise<LookUpGroupReply>;
  lastAsked?: Record<string, number>;
  lastAskedBefore?: AskedBefore;
  removeReviewers?: (members: string[]) => Promise<RemoveReviewersReply>;
}

const removingEveryone = (members: string[]): Promise<RemoveReviewersReply> =>
  Promise.resolve({ ok: true, outcome: { removed: members, notRequested: [], unconfirmed: [] } });

const everyoneAvailable = (members: string[]): Promise<LookUpGroupReply> =>
  Promise.resolve({
    ok: true,
    author: null,
    members: members.map((member) => ({ member, candidate: candidate(member) })),
  });

const countingFrom = (counts: Record<string, number>) =>
  vi
    .fn<(login: string) => Promise<CountOpenRequestsReply>>()
    .mockImplementation((login) => Promise.resolve({ ok: true, count: counts[login] ?? 0 }));

const memoryArea = () => {
  let stored: Record<string, unknown> = {};
  return {
    get: () => Promise.resolve(stored),
    set: (items: Record<string, unknown>) => {
      stored = { ...stored, ...items };
      return Promise.resolve();
    },
  };
};

export const renderApp = ({
  groups = [],
  unreadable = 0,
  loadFailure,
  saveFailure,
  pullRequest = "acme/widgets#7",
  candidates = { ok: true, candidates: reviewers, reviewed: [] },
  candidatesAfterRequest = candidates,
  searches = {},
  draft = emptyDraft,
  draftLoad = Promise.resolve(draft),
  directory = EMPTY_DIRECTORY,
  requestReview = vi.fn<(members: string[]) => Promise<RequestReviewReply>>(),
  openRequestCounts = {},
  countReply,
  lookUpGroup = everyoneAvailable,
  lastAsked = {},
  lastAskedBefore = {},
  removeReviewers = removingEveryone,
}: RenderOptions = {}) => {
  const openOptions = vi.fn<() => void>();
  const recordAsked = vi.fn<RotationStore["record"]>().mockResolvedValue(lastAskedBefore);
  const restoreAsked = vi.fn<RotationStore["restore"]>().mockResolvedValue(undefined);
  const rotation: RotationStore = {
    load: () => Promise.resolve(lastAsked),
    record: recordAsked,
    restore: restoreAsked,
  };
  const countInTab = vi
    .fn<(login: string) => Promise<CountOpenRequestsReply>>()
    .mockImplementation(countReply ?? countingFrom(openRequestCounts));
  const openRequests = new OpenRequestCounter({ countInTab, area: memoryArea() });
  const directoryStore = {
    load: vi.fn<DirectoryStore["load"]>().mockResolvedValueOnce(directory),
    save: vi.fn<DirectoryStore["save"]>().mockResolvedValue(undefined),
  } satisfies DirectoryStore;
  const save = vi.fn<GroupStore["save"]>();
  if (saveFailure === undefined) save.mockResolvedValue(undefined);
  else save.mockRejectedValueOnce(saveFailure);
  const load = vi.fn<GroupStore["load"]>();
  if (loadFailure === undefined) load.mockResolvedValueOnce({ groups, unreadable });
  else load.mockRejectedValueOnce(loadFailure);
  const store = { load, save } satisfies GroupStore;
  const drafts = {
    load: vi.fn<DraftStore["load"]>().mockReturnValueOnce(draftLoad),
    save: vi.fn<DraftStore["save"]>().mockResolvedValue(undefined),
  } satisfies DraftStore;
  let requestsSent = 0;
  const countedRequest = (members: string[]) => {
    requestsSent += 1;
    return requestReview(members);
  };
  const listReviewers = vi
    .fn<(query: string) => Promise<ListReviewersReply>>()
    .mockImplementation((query) =>
      Promise.resolve(
        query !== ""
          ? { ok: true, candidates: searches[query] ?? [], reviewed: [] }
          : requestsSent > 0
            ? candidatesAfterRequest
            : candidates,
      ),
    );
  render(
    <App
      store={store}
      drafts={drafts}
      directory={directoryStore}
      requestReview={countedRequest}
      listReviewers={listReviewers}
      openRequests={openRequests}
      lookUpGroup={lookUpGroup}
      rotation={rotation}
      openOptions={openOptions}
      removeReviewers={removeReviewers}
      newId={() => "new-id"}
      pullRequest={pullRequest}
    />,
  );
  return {
    save: store.save,
    saveDraft: drafts.save,
    saveDirectory: directoryStore.save,
    listReviewers,
    requestReview,
    countInTab,
    openRequests,
    recordAsked,
    restoreAsked,
    openOptions,
  };
};

export const tick = async (login: string) =>
  fireEvent.click(await screen.findByRole("checkbox", { name: login }));

export const isTicked = (login: string) =>
  screen.getByRole<HTMLInputElement>("checkbox", { name: login }).checked;

export const fillGroupForm = (name: string, members: string) => {
  fireEvent.change(screen.getByLabelText("Group name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Members"), { target: { value: members } });
  fireEvent.click(screen.getByRole("button", { name: "Save group" }));
};
