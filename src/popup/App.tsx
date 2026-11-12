import { useEffect, useState, type FormEvent } from "react";
import type { Group } from "../groups/group";
import { parseMemberList } from "../groups/memberList";
import { describeReply, type RequestReviewReply } from "../messages";

export interface GroupStore {
  load(): Promise<Group[]>;
  save(groups: Group[]): Promise<void>;
}

export interface AppProps {
  store: GroupStore;
  requestReview: (members: string[]) => Promise<RequestReviewReply>;
  newId: () => string;
  pullRequest: string | null;
}

type Editor = { kind: "closed" } | { kind: "new" } | { kind: "edit"; group: Group };

interface GroupDraft {
  name: string;
  members: string[];
}

const validateDraft = (name: string, membersText: string): GroupDraft | string => {
  const { members, invalid } = parseMemberList(membersText);
  if (name.trim().length === 0) return "Give the group a name.";
  if (invalid.length > 0) return `Not GitHub logins: ${invalid.join(", ")}`;
  if (members.length === 0) return "Add at least one GitHub login.";
  return { name: name.trim(), members };
};

function GroupForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: GroupDraft;
  onSave: (draft: GroupDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [membersText, setMembersText] = useState(initial.members.join(", "));
  const [problem, setProblem] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const draft = validateDraft(name, membersText);
    if (typeof draft === "string") {
      setProblem(draft);
      return;
    }
    onSave(draft);
  };

  return (
    <form className="editor" onSubmit={submit}>
      <label className="field">
        <span>Group name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Backend"
          autoFocus
        />
      </label>
      <label className="field">
        <span>Members</span>
        <textarea
          value={membersText}
          onChange={(event) => setMembersText(event.target.value)}
          placeholder="mona, hubot, acme/backend-team"
          rows={3}
        />
      </label>
      <p className="hint">GitHub logins or org/team slugs, separated by commas, spaces or new lines.</p>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <div className="actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save group
        </button>
      </div>
    </form>
  );
}

function GroupCard({
  group,
  canRequest,
  busy,
  onRequest,
  onEdit,
  onDelete,
}: {
  group: Group;
  canRequest: boolean;
  busy: boolean;
  onRequest: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="card" aria-label={group.name}>
      <div className="card-text">
        <strong className="card-name">{group.name}</strong>
        <span className="card-members">{group.members.join(", ")}</span>
      </div>
      <div className="card-actions">
        <button
          type="button"
          className="btn btn-primary"
          aria-label={`Request ${group.name}`}
          disabled={!canRequest || busy}
          onClick={onRequest}
        >
          {busy ? "Requesting…" : "Request"}
        </button>
        <button type="button" className="btn btn-quiet" aria-label={`Edit ${group.name}`} onClick={onEdit}>
          Edit
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-danger"
          aria-label={`Delete ${group.name}`}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

export function App({ store, requestReview, newId, pullRequest }: AppProps) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [loadProblem, setLoadProblem] = useState("");
  const [editor, setEditor] = useState<Editor>({ kind: "closed" });
  const [status, setStatus] = useState("");
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);

  useEffect(() => {
    store.load().then(setGroups, (error: unknown) => {
      setLoadProblem(
        `Saved groups could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }, [store]);

  const persist = async (next: Group[]) => {
    setGroups(next);
    await store.save(next);
  };

  const saveDraft = async (draft: GroupDraft) => {
    const current = groups ?? [];
    const next =
      editor.kind === "edit"
        ? current.map((group) => (group.id === editor.group.id ? { ...group, ...draft } : group))
        : [...current, { id: newId(), ...draft }];
    setEditor({ kind: "closed" });
    await persist(next);
  };

  const request = async (group: Group) => {
    setBusyGroupId(group.id);
    setStatus("");
    const reply = await requestReview(group.members);
    setBusyGroupId(null);
    setStatus(describeReply(reply));
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

      {groups === null ? null : groups.length === 0 && editor.kind === "closed" ? (
        <p className="empty">No groups yet.</p>
      ) : (
        <ul className="cards">
          {groups.map((group) =>
            editor.kind === "edit" && editor.group.id === group.id ? (
              <li key={group.id} className="card card-editing">
                <GroupForm
                  initial={group}
                  onSave={(draft) => void saveDraft(draft)}
                  onCancel={() => setEditor({ kind: "closed" })}
                />
              </li>
            ) : (
              <GroupCard
                key={group.id}
                group={group}
                canRequest={pullRequest !== null}
                busy={busyGroupId === group.id}
                onRequest={() => void request(group)}
                onEdit={() => setEditor({ kind: "edit", group })}
                onDelete={() => void persist(groups.filter((other) => other.id !== group.id))}
              />
            ),
          )}
        </ul>
      )}

      {status && (
        <p className="status" role="status">
          {status}
        </p>
      )}

      {editor.kind === "new" ? (
        <div className="card card-editing">
          <GroupForm
            initial={{ name: "", members: [] }}
            onSave={(draft) => void saveDraft(draft)}
            onCancel={() => setEditor({ kind: "closed" })}
          />
        </div>
      ) : (
        <button type="button" className="btn btn-block" onClick={() => setEditor({ kind: "new" })}>
          New group
        </button>
      )}
    </main>
  );
}
