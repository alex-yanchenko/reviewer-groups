import { useCallback, useState } from "react";
import { withOptions, type Group, type GroupOptions } from "../groups/group";
import { repositoryOf } from "../groups/repoPatterns";
import type {
  ListReviewersReply,
  LookUpGroupReply,
  RemoveReviewersReply,
  RequestReviewReply,
  ReviewerCandidate,
} from "../messages";
import { isGone, markGone, rememberedPeople, rememberPeople } from "./directory";
import { emptiedDraft, type Draft } from "./draft";
import { FirstRunIntro, loginsTickedHere, useFirstRunTicks } from "./FirstRun";
import { GroupForm, type GroupDraft } from "./GroupForm";
import { GroupList } from "./GroupList";
import { placeForRepository } from "./groupSettings";
import { PeoplePicker } from "./PeoplePicker";
import type { OpenRequestCounter } from "./openRequestCounter";
import { RemoveOffer } from "./RemoveOffer";
import { ReRequestOffer } from "./ReRequestOffer";
import type { RotationStore } from "./rotation";
import { rankSearchResults } from "./searchResults";
import { isTicked, tickLogins, toggleLogin } from "./selection";
import { SelectionBar } from "./SelectionBar";
import { useOpenRequestCounts } from "./useOpenRequestCounts";
import { useReviewerList } from "./useReviewerList";
import { REMOVE_BUSY, useReviewRequests } from "./useReviewRequests";
import { useSavedState, type DirectoryStore, type DraftStore, type GroupStore } from "./useSavedState";

export type { DirectoryStore, Draft, DraftStore, GroupStore };

export interface AppProps {
  store: GroupStore;
  drafts: DraftStore;
  directory: DirectoryStore;
  requestReview: (members: string[]) => Promise<RequestReviewReply>;
  listReviewers: (query: string) => Promise<ListReviewersReply>;
  openRequests: OpenRequestCounter;
  lookUpGroup: (members: string[]) => Promise<LookUpGroupReply>;
  rotation: RotationStore;
  openOptions: () => void;
  removeReviewers: (members: string[]) => Promise<RemoveReviewersReply>;
  newId: () => string;
  pullRequest: string | null;
}

type TypedEditor = { kind: "closed" } | { kind: "new" } | { kind: "edit"; group: Group };

const SELECTION_BUSY = "selection";

const RE_REQUEST_BUSY = "re-request";

const withoutEarlierFirstRunTicks = ({ selection, firstRunTicked }: Draft): string[] =>
  selection.filter((login) => !isTicked(firstRunTicked?.logins ?? [], login));

const matchesSearch = (person: ReviewerCandidate, search: string) => {
  const needle = search.trim().toLowerCase();
  return person.login.toLowerCase().includes(needle) || person.description.toLowerCase().includes(needle);
};

export function App({
  store,
  drafts,
  directory: directoryStore,
  requestReview,
  listReviewers,
  openRequests,
  lookUpGroup,
  rotation,
  openOptions,
  removeReviewers,
  newId,
  pullRequest,
}: AppProps) {
  const [typedEditor, setTypedEditor] = useState<TypedEditor>({ kind: "closed" });
  const [search, setSearch] = useState("");
  const {
    groups,
    unreadable,
    loadProblem,
    notice,
    draft,
    draftReady,
    directory,
    directoryReady,
    updateDirectory,
    updateDraft,
    persist,
  } = useSavedState({ store, drafts, directoryStore });

  const rememberFound = useCallback(
    (found: ReviewerCandidate[]) => updateDirectory((current) => rememberPeople(current, found)),
    [updateDirectory],
  );

  const { reviewers, readAgain } = useReviewerList({
    listReviewers,
    pullRequest,
    search,
    ready: directoryReady,
    onFound: rememberFound,
  });
  const counts = useOpenRequestCounts(openRequests, reviewers);
  const { busy, status, justRequested, requestFrom, requestGroup, removeJustRequested } = useReviewRequests({
    requestReview,
    lookUpGroup,
    removeReviewers,
    openRequests,
    rotation,
    onGone: (gone) => updateDirectory((current) => markGone(current, gone)),
    onWritten: readAgain,
  });

  const firstRun = groups !== null && groups.length === 0 && unreadable === 0;
  useFirstRunTicks({
    active: firstRun,
    reviewers,
    draftReady,
    pullRequest,
    tickedOn: draft.firstRunTicked?.pullRequest,
    tick: (tickedPullRequest, logins) =>
      updateDraft({
        ...draft,
        selection: tickLogins(withoutEarlierFirstRunTicks(draft), logins),
        firstRunTicked: { pullRequest: tickedPullRequest, logins },
      }),
  });

  const remembered = rememberedPeople(directory);
  const picker =
    reviewers.state === "ready"
      ? { found: rankSearchResults(search, reviewers.candidates), problem: reviewers.problem }
      : pullRequest === null && remembered.length > 0
        ? {
            found: rankSearchResults(
              search,
              remembered.filter((person) => matchesSearch(person, search)),
            ),
            problem: "",
          }
        : null;
  const pickerWillShow = picker !== null || reviewers.state === "loading";
  const editingGroup =
    draft.editingGroupId === null ? undefined : groups?.find((group) => group.id === draft.editingGroupId);

  const requestSelection = async () => {
    const reply = await requestFrom(SELECTION_BUSY, draft.selection);
    if (reply.ok) updateDraft(emptiedDraft(draft));
  };

  const saveAsGroup = (name: string): string => {
    if (name.trim().length === 0) return "Give the group a name.";
    persist([...(groups ?? []), { id: newId(), name: name.trim(), members: draft.selection }]);
    updateDraft(emptiedDraft(draft));
    return "";
  };

  const replaceGroup = (changed: Group) =>
    persist((groups ?? []).map((group) => (group.id === changed.id ? changed : group)));

  const saveChanges = (options: GroupOptions): string => {
    if (draft.selection.length === 0) return "Tick at least one person.";
    if (editingGroup !== undefined) {
      replaceGroup(withOptions({ ...editingGroup, members: draft.selection }, options));
    }
    updateDraft(emptiedDraft(draft));
    return "";
  };

  const startEdit = (group: Group) => {
    if (pickerWillShow) updateDraft({ ...draft, selection: [...group.members], editingGroupId: group.id });
    else setTypedEditor({ kind: "edit", group });
  };

  const deleteGroup = (group: Group) => {
    persist((groups ?? []).filter((other) => other.id !== group.id));
    if (draft.editingGroupId === group.id) updateDraft(emptiedDraft(draft));
  };

  const removeMissingMembers = (group: Group) =>
    replaceGroup({ ...group, members: group.members.filter((member) => !isGone(directory, member)) });

  const saveTypedGroup = ({ name, members, options }: GroupDraft) => {
    if (typedEditor.kind === "edit")
      replaceGroup(withOptions({ ...typedEditor.group, name, members }, options));
    else persist([...(groups ?? []), { id: newId(), name, members, ...options }]);
    setTypedEditor({ kind: "closed" });
  };

  if (loadProblem) {
    return (
      <main className="popup">
        <p className="problem" role="alert">
          {loadProblem}
        </p>
      </main>
    );
  }

  return (
    <main className="popup">
      <header className="header">
        <h1>Reviewer Groups</h1>
        {pullRequest ? (
          <span className="target">{pullRequest}</span>
        ) : (
          <span className="target target-none">Open a GitHub pull request to request review.</span>
        )}
      </header>

      {notice && (
        <p className="problem" role="alert">
          {notice}
        </p>
      )}

      {firstRun && (
        <FirstRunIntro
          onPullRequest={pullRequest !== null}
          ticked={loginsTickedHere(draft, pullRequest).length}
        />
      )}

      {groups !== null && groups.length > 0 && (
        <GroupList
          placed={placeForRepository(groups, repositoryOf(pullRequest))}
          directory={directory}
          typedEditGroupId={typedEditor.kind === "edit" ? typedEditor.group.id : null}
          pickerEditGroupId={editingGroup?.id ?? null}
          canRequest={pullRequest !== null}
          busy={busy}
          actions={{
            onRequest: (group) => void requestGroup(group),
            onEdit: startEdit,
            onDelete: deleteGroup,
            onRemoveMissing: removeMissingMembers,
            onSaveTyped: saveTypedGroup,
            onCancelTyped: () => setTypedEditor({ kind: "closed" }),
          }}
        />
      )}

      {groups !== null &&
        groups.length === 0 &&
        !firstRun &&
        !pickerWillShow &&
        typedEditor.kind === "closed" && <p className="empty">No groups yet.</p>}

      {status && (
        <p className="status" role="status">
          {status}
        </p>
      )}

      <RemoveOffer
        logins={justRequested}
        busy={busy === REMOVE_BUSY}
        locked={busy !== null}
        onRemove={() => void removeJustRequested()}
      />

      {reviewers.state === "ready" && (
        <ReRequestOffer
          reviewed={reviewers.reviewed}
          busy={busy === RE_REQUEST_BUSY}
          locked={busy !== null}
          onReRequest={(logins) => void requestFrom(RE_REQUEST_BUSY, logins)}
        />
      )}

      {reviewers.state === "loading" && <p className="hint">Reading reviewers from the pull request…</p>}
      {reviewers.state === "failed" && (
        <p className="problem" role="alert">
          {reviewers.error}
        </p>
      )}

      {picker !== null && (
        <>
          <PeoplePicker
            found={picker.found}
            directory={directory}
            selection={draft.selection}
            search={search}
            problem={picker.problem}
            counts={counts}
            onSearch={setSearch}
            onToggle={(login) => updateDraft({ ...draft, selection: toggleLogin(draft.selection, login) })}
          />
          <SelectionBar
            key={editingGroup?.id ?? "new"}
            draft={draft}
            editingGroup={editingGroup}
            busy={busy === SELECTION_BUSY}
            locked={busy !== null || pullRequest === null}
            onRequest={() => void requestSelection()}
            onSaveAsGroup={saveAsGroup}
            onSaveChanges={saveChanges}
            onCancelEdit={() => updateDraft(emptiedDraft(draft))}
          />
        </>
      )}

      {!pickerWillShow &&
        (typedEditor.kind === "new" ? (
          <div className="card card-editing">
            <GroupForm
              initial={{ name: "", members: [] }}
              onSave={saveTypedGroup}
              onCancel={() => setTypedEditor({ kind: "closed" })}
            />
          </div>
        ) : (
          <button type="button" className="btn btn-block" onClick={() => setTypedEditor({ kind: "new" })}>
            New group
          </button>
        ))}

      <footer className="footer">
        <button type="button" className="link-button" onClick={openOptions}>
          Export or import groups
        </button>
      </footer>
    </main>
  );
}
