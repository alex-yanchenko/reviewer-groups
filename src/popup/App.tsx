import { useEffect, useState, type FormEvent } from "react";
import type { Group } from "../groups/group";
import {
  describeReply,
  type ListReviewersReply,
  type RequestReviewReply,
  type ReviewerCandidate,
} from "../messages";
import { EMPTY_DRAFT, type Draft } from "./draft";
import { GroupCard } from "./GroupCard";
import { GroupForm, type GroupDraft } from "./GroupForm";
import { PeoplePicker } from "./PeoplePicker";

export type { Draft };

export interface GroupStore {
  load(): Promise<Group[]>;
  save(groups: Group[]): Promise<void>;
}

export interface DraftStore {
  load(): Promise<Draft>;
  save(draft: Draft): Promise<void>;
}

export interface AppProps {
  store: GroupStore;
  drafts: DraftStore;
  requestReview: (members: string[]) => Promise<RequestReviewReply>;
  listReviewers: () => Promise<ListReviewersReply>;
  newId: () => string;
  pullRequest: string | null;
}

type TypedEditor = { kind: "closed" } | { kind: "new" } | { kind: "edit"; group: Group };

type Reviewers =
  | { state: "absent" }
  | { state: "loading" }
  | { state: "ready"; candidates: ReviewerCandidate[] }
  | { state: "failed"; error: string };

const SELECTION_BUSY = "selection";

const toggleLogin = (selection: string[], login: string): string[] =>
  selection.some((ticked) => ticked.toLowerCase() === login.toLowerCase())
    ? selection.filter((ticked) => ticked.toLowerCase() !== login.toLowerCase())
    : [...selection, login];

const reviewersFromReply = (reply: ListReviewersReply): Reviewers =>
  reply.ok ? { state: "ready", candidates: reply.candidates } : { state: "failed", error: reply.error };

function SelectionBar({
  draft,
  editingGroup,
  busy,
  onRequest,
  onSaveAsGroup,
  onSaveChanges,
  onCancelEdit,
}: {
  draft: Draft;
  editingGroup: Group | undefined;
  busy: boolean;
  onRequest: () => void;
  onSaveAsGroup: (name: string) => string;
  onSaveChanges: () => string;
  onCancelEdit: () => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const count = draft.selection.length;

  const submitName = (event: FormEvent) => {
    event.preventDefault();
    const outcome = onSaveAsGroup(name);
    setProblem(outcome);
    if (outcome === "") {
      setNaming(false);
      setName("");
    }
  };

  const problemLine = problem && (
    <p className="problem" role="alert">
      {problem}
    </p>
  );

  if (editingGroup !== undefined) {
    return (
      <div className="selection-bar">
        <span className="selection-count">Editing {editingGroup.name}</span>
        {problemLine}
        <div className="actions">
          <button type="button" className="btn" onClick={onCancelEdit}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setProblem(onSaveChanges())}>
            Save changes
          </button>
        </div>
      </div>
    );
  }

  if (naming) {
    return (
      <form className="selection-bar" onSubmit={submitName}>
        <label className="field">
          <span>Group name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Backend"
            autoFocus
          />
        </label>
        {problemLine}
        <div className="actions">
          <button type="button" className="btn" onClick={() => setNaming(false)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save group
          </button>
        </div>
      </form>
    );
  }

  if (count === 0) return null;

  return (
    <div className="selection-bar selection-bar-row">
      <span className="selection-count">{count} selected</span>
      <div className="actions">
        <button type="button" className="btn" onClick={() => setNaming(true)}>
          Save as group
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onRequest}>
          {busy ? "Requesting…" : `Request ${count}`}
        </button>
      </div>
    </div>
  );
}

export function App({ store, drafts, requestReview, listReviewers, newId, pullRequest }: AppProps) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [loadProblem, setLoadProblem] = useState("");
  const [typedEditor, setTypedEditor] = useState<TypedEditor>({ kind: "closed" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewers, setReviewers] = useState<Reviewers>({ state: pullRequest ? "loading" : "absent" });
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  useEffect(() => {
    store.load().then(setGroups, (error: unknown) => {
      setLoadProblem(
        `Saved groups could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    void drafts.load().then(setDraft);
    if (pullRequest) void listReviewers().then((reply) => setReviewers(reviewersFromReply(reply)));
  }, [store, drafts, listReviewers, pullRequest]);

  const pickerReady = reviewers.state === "ready";
  const editingGroup =
    draft.editingGroupId === null ? undefined : groups?.find((group) => group.id === draft.editingGroupId);

  const updateDraft = (next: Draft) => {
    setDraft(next);
    void drafts.save(next);
  };

  const persist = (next: Group[]) => {
    setGroups(next);
    void store.save(next);
  };

  const requestFrom = async (busyKey: string, members: string[]): Promise<RequestReviewReply> => {
    setBusy(busyKey);
    setStatus("");
    const reply = await requestReview(members);
    setBusy(null);
    setStatus(describeReply(reply));
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

  const saveChanges = (): string => {
    if (draft.selection.length === 0) return "Tick at least one person.";
    persist(
      (groups ?? []).map((group) =>
        group.id === draft.editingGroupId ? { ...group, members: draft.selection } : group,
      ),
    );
    updateDraft(EMPTY_DRAFT);
    return "";
  };

  const startEdit = (group: Group) => {
    if (pickerReady) updateDraft({ selection: [...group.members], editingGroupId: group.id });
    else setTypedEditor({ kind: "edit", group });
  };

  const deleteGroup = (group: Group) => {
    persist((groups ?? []).filter((other) => other.id !== group.id));
    if (draft.editingGroupId === group.id) updateDraft(EMPTY_DRAFT);
  };

  const saveTypedGroup = (typed: GroupDraft) => {
    const current = groups ?? [];
    persist(
      typedEditor.kind === "edit"
        ? current.map((group) => (group.id === typedEditor.group.id ? { ...group, ...typed } : group))
        : [...current, { id: newId(), ...typed }],
    );
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
                canRequest={pullRequest !== null}
                busy={busy === group.id}
                editing={editingGroup?.id === group.id}
                onRequest={() => void requestFrom(group.id, group.members)}
                onEdit={() => startEdit(group)}
                onDelete={() => deleteGroup(group)}
              />
            ),
          )}
        </ul>
      )}

      {groups !== null && groups.length === 0 && !pickerReady && typedEditor.kind === "closed" && (
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

      {reviewers.state === "ready" && (
        <>
          <PeoplePicker
            candidates={reviewers.candidates}
            selection={draft.selection}
            onToggle={(login) => updateDraft({ ...draft, selection: toggleLogin(draft.selection, login) })}
          />
          <SelectionBar
            key={draft.editingGroupId ?? "new"}
            draft={draft}
            editingGroup={editingGroup}
            busy={busy === SELECTION_BUSY}
            onRequest={() => void requestSelection()}
            onSaveAsGroup={saveAsGroup}
            onSaveChanges={saveChanges}
            onCancelEdit={() => updateDraft(EMPTY_DRAFT)}
          />
        </>
      )}

      {!pickerReady &&
        reviewers.state !== "loading" &&
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
