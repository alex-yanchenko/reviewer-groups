import { useState, type FormEvent } from "react";
import { parseMemberList } from "../groups/memberList";

export interface GroupDraft {
  name: string;
  members: string[];
}

const validateTypedGroup = (name: string, membersText: string): GroupDraft | string => {
  const { members, invalid } = parseMemberList(membersText);
  if (name.trim().length === 0) return "Give the group a name.";
  if (invalid.length > 0) return `Not GitHub logins: ${invalid.join(", ")}`;
  if (members.length === 0) return "Add at least one GitHub login.";
  return { name: name.trim(), members };
};

export function GroupForm({
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
    const draft = validateTypedGroup(name, membersText);
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
