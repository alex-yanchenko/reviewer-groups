import { useCallback, useEffect, useRef, useState } from "react";
import { withOptions, type Group, type GroupOptions } from "../groups/group";
import { repositoryOf } from "../groups/repoPatterns";
import type { StoredGroups } from "../groups/storage";
import type {
  ListReviewersReply,
  LookUpGroupReply,
  RequestReviewReply,
  ReviewerCandidate,
} from "../messages";
import {
  EMPTY_DIRECTORY,
  isGone,
  markGone,
  rememberedPeople,
  rememberPeople,
  type Directory,
} from "./directory";
import { EMPTY_DRAFT, type Draft } from "./draft";
import { GroupForm, type GroupDraft } from "./GroupForm";
import { GroupList } from "./GroupList";
import { placeForRepository } from "./groupSettings";
import { PeoplePicker } from "./PeoplePicker";
import type { OpenRequestCounter } from "./openRequestCounter";
import { ReRequestOffer } from "./ReRequestOffer";
import type { RotationStore } from "./rotation";
import { useOpenRequestCounts } from "./useOpenRequestCounts";
import { useReviewerList } from "./useReviewerList";
import { useReviewRequests } from "./useReviewRequests";
import { rankSearchResults } from "./searchResults";
import { SelectionBar } from "./SelectionBar";

export type { Draft };

export interface GroupStore {
  load(): Promise<StoredGroups>;
  save(groups: Group[]): Promise<void>;
}

export interface DraftStore {
  load(): Promise<Draft>;
  save(draft: Draft): Promise<void>;
}

export interface DirectoryStore {
  load(): Promise<Directory>;
  save(directory: Directory): Promise<void>;
}

export interface AppProps {
  store: GroupStore;
  drafts: DraftStore;
  directory: DirectoryStore;
  requestReview: (members: string[]) => Promise<RequestReviewReply>;
  listReviewers: (query: string) => Promise<ListReviewersReply>;
  openRequests: OpenRequestCounter;
  lookUpGroup: (members: string[]) => Promise<LookUpGroupReply>;
  rotation: RotationStore;
  newId: () => string;
  pullRequest: string | null;
}

type TypedEditor = { kind: "closed" } | { kind: "new" } | { kind: "edit"; group: Group };

const SELECTION_BUSY = "selection";

const RE_REQUEST_BUSY = "re-request";

const toggleLogin = (selection: string[], login: string): string[] =>
  selection.some((ticked) => ticked.toLowerCase() === login.toLowerCase())
    ? selection.filter((ticked) => ticked.toLowerCase() !== login.toLowerCase())
    : [...selection, login];

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const describeUnreadableGroups = (count: number) => {
  if (count === 0) return "";
  return count === 1
    ? "1 saved group could not be read and was left out."
    : `${count} saved groups could not be read and were left out.`;
};

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
  newId,
  pullRequest,
}: AppProps) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [loadProblem, setLoadProblem] = useState("");
  const [typedEditor, setTypedEditor] = useState<TypedEditor>({ kind: "closed" });
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [search, setSearch] = useState("");
  const [directory, setDirectory] = useState<Directory>(EMPTY_DIRECTORY);
  const [directoryReady, setDirectoryReady] = useState(false);
  const directoryRef = useRef<Directory>(EMPTY_DIRECTORY);

  useEffect(() => {
    store.load().then(
      ({ groups: readable, unreadable }) => {
        setGroups(readable);
        setNotice(describeUnreadableGroups(unreadable));
      },
      (error: unknown) => setLoadProblem(`Saved groups could not be read: ${messageOf(error)}`),
    );
    void drafts.load().then((saved) => setDraft((current) => (current === EMPTY_DRAFT ? saved : current)));
    directoryStore
      .load()
      .then(
        (saved) => {
          directoryRef.current = saved;
          setDirectory(saved);
        },
        (error: unknown) => setNotice(`Remembered people could not be read: ${messageOf(error)}`),
      )
      .finally(() => setDirectoryReady(true));
  }, [store, drafts, directoryStore]);

  const updateDirectory = useCallback(
    (change: (current: Directory) => Directory) => {
      const next = change(directoryRef.current);
      directoryRef.current = next;
      setDirectory(next);
      void directoryStore
        .save(next)
        .catch((error: unknown) => setNotice(`Remembered people could not be saved: ${messageOf(error)}`));
    },
    [directoryStore],
  );

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
  const { busy, status, requestFrom, requestGroup } = useReviewRequests({
    requestReview,
    lookUpGroup,
    openRequests,
    rotation,
    onGone: (gone) => updateDirectory((current) => markGone(current, gone)),
    onWritten: readAgain,
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

  const updateDraft = (next: Draft) => {
    setDraft(next);
    void drafts.save(next);
  };

  const persist = (next: Group[]) => {
    const previous = groups;
    setGroups(next);
    setNotice("");
    void store.save(next).catch((error: unknown) => {
      setGroups(previous);
      setNotice(`Groups could not be saved: ${messageOf(error)}`);
    });
  };

  const requestSelection = async () => {
    const reply = await requestFrom(SELECTION_BUSY, draft.selection);
    if (reply.ok) updateDraft(EMPTY_DRAFT);
  };

  const saveAsGroup = (name: string): string => {
    if (name.trim().length === 0) return "Give the group a name.";
    persist([...(groups ?? []), { id: newId(), name: name.trim(), members: draft.selection }]);
    updateDraft(EMPTY_DRAFT);
    return "";
  };

  const replaceGroup = (changed: Group) =>
    persist((groups ?? []).map((group) => (group.id === changed.id ? changed : group)));

  const saveChanges = (options: GroupOptions): string => {
    if (draft.selection.length === 0) return "Tick at least one person.";
    if (editingGroup !== undefined) {
      replaceGroup(withOptions({ ...editingGroup, members: draft.selection }, options));
    }
    updateDraft(EMPTY_DRAFT);
    return "";
  };

  const startEdit = (group: Group) => {
    if (pickerWillShow) updateDraft({ selection: [...group.members], editingGroupId: group.id });
    else setTypedEditor({ kind: "edit", group });
  };

  const deleteGroup = (group: Group) => {
    persist((groups ?? []).filter((other) => other.id !== group.id));
    if (draft.editingGroupId === group.id) updateDraft(EMPTY_DRAFT);
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

      {groups !== null && groups.length === 0 && !pickerWillShow && typedEditor.kind === "closed" && (
        <p className="empty">No groups yet.</p>
      )}

      {status && (
        <p className="status" role="status">
          {status}
        </p>
      )}

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
            onCancelEdit={() => updateDraft(EMPTY_DRAFT)}
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
    </main>
  );
}
