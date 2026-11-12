import { useCallback, useEffect, useRef, useState } from "react";
import type { Group } from "../groups/group";
import type { StoredGroups } from "../groups/storage";
import {
  describeReply,
  type ListReviewersReply,
  type RequestReviewReply,
  type ReviewerCandidate,
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
import { GroupCard } from "./GroupCard";
import { GroupForm, type GroupDraft } from "./GroupForm";
import { PeoplePicker } from "./PeoplePicker";
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
  newId: () => string;
  pullRequest: string | null;
}

type TypedEditor = { kind: "closed" } | { kind: "new" } | { kind: "edit"; group: Group };

type Reviewers =
  | { state: "absent" }
  | { state: "loading" }
  | { state: "ready"; candidates: ReviewerCandidate[]; problem: string }
  | { state: "failed"; error: string };

const SELECTION_BUSY = "selection";

const SEARCH_DEBOUNCE_MS = 250;

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

const reviewersAfterReply = (previous: Reviewers, reply: ListReviewersReply): Reviewers => {
  if (reply.ok) return { state: "ready", candidates: reply.candidates, problem: "" };
  if (previous.state === "ready") return { ...previous, problem: reply.error };
  return { state: "failed", error: reply.error };
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
  newId,
  pullRequest,
}: AppProps) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [loadProblem, setLoadProblem] = useState("");
  const [typedEditor, setTypedEditor] = useState<TypedEditor>({ kind: "closed" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [reviewers, setReviewers] = useState<Reviewers>({ state: pullRequest ? "loading" : "absent" });
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

  useEffect(() => {
    if (!pullRequest || !directoryReady) return;
    let stillWanted = true;
    const query = search.trim();
    const timer = setTimeout(
      () => {
        void listReviewers(query).then((reply) => {
          if (!stillWanted) return;
          setReviewers((previous) => reviewersAfterReply(previous, reply));
          if (reply.ok) updateDirectory((current) => rememberPeople(current, reply.candidates));
        });
      },
      query === "" ? 0 : SEARCH_DEBOUNCE_MS,
    );
    return () => {
      stillWanted = false;
      clearTimeout(timer);
    };
  }, [listReviewers, pullRequest, search, directoryReady, updateDirectory]);

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

  const requestFrom = async (busyKey: string, members: string[]): Promise<RequestReviewReply> => {
    setBusy(busyKey);
    setStatus("");
    const reply = await requestReview(members);
    setBusy(null);
    setStatus(describeReply(reply));
    if (reply.ok && reply.outcome.gone.length > 0) {
      updateDirectory((current) => markGone(current, reply.outcome.gone));
    }
    return reply;
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

  const saveChanges = (): string => {
    if (draft.selection.length === 0) return "Tick at least one person.";
    if (editingGroup !== undefined) replaceGroup({ ...editingGroup, members: draft.selection });
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

  const saveTypedGroup = (typed: GroupDraft) => {
    if (typedEditor.kind === "edit") replaceGroup({ ...typedEditor.group, ...typed });
    else persist([...(groups ?? []), { id: newId(), ...typed }]);
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
        <ul className="cards" aria-label="Groups">
          {groups.map((group) =>
            typedEditor.kind === "edit" && typedEditor.group.id === group.id ? (
              <li key={group.id} className="card card-editing">
                <GroupForm
                  initial={group}
                  onSave={saveTypedGroup}
                  onCancel={() => setTypedEditor({ kind: "closed" })}
                />
              </li>
            ) : (
              <GroupCard
                key={group.id}
                group={group}
                goneMembers={group.members.filter((member) => isGone(directory, member))}
                canRequest={pullRequest !== null}
                busy={busy === group.id}
                locked={busy !== null}
                editing={editingGroup?.id === group.id}
                onRequest={() => void requestFrom(group.id, group.members)}
                onEdit={() => startEdit(group)}
                onDelete={() => deleteGroup(group)}
                onRemoveMissing={() => removeMissingMembers(group)}
              />
            ),
          )}
        </ul>
      )}

      {groups !== null && groups.length === 0 && !pickerWillShow && typedEditor.kind === "closed" && (
        <p className="empty">No groups yet.</p>
      )}

      {status && (
        <p className="status" role="status">
          {status}
        </p>
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
            onSearch={setSearch}
            onToggle={(login) => updateDraft({ ...draft, selection: toggleLogin(draft.selection, login) })}
          />
          <SelectionBar
            key={draft.editingGroupId ?? "new"}
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
