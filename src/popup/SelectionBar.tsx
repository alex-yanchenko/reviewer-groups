import { useState, type FormEvent } from "react";
import type { Group } from "../groups/group";
import type { Draft } from "./draft";

export function SelectionBar({
  draft,
  editingGroup,
  busy,
  locked,
  onRequest,
  onSaveAsGroup,
  onSaveChanges,
  onCancelEdit,
}: {
  draft: Draft;
  editingGroup: Group | undefined;
  busy: boolean;
  locked: boolean;
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
        <button type="button" className="btn btn-primary" disabled={locked} onClick={onRequest}>
          {busy ? "Requesting…" : `Request ${count}`}
        </button>
      </div>
    </div>
  );
}
