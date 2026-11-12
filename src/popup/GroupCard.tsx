import type { Group } from "../groups/group";

export function GroupCard({
  group,
  canRequest,
  busy,
  locked,
  editing,
  onRequest,
  onEdit,
  onDelete,
}: {
  group: Group;
  canRequest: boolean;
  busy: boolean;
  locked: boolean;
  editing: boolean;
  onRequest: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={editing ? "card card-editing" : "card"} aria-label={group.name}>
      <div className="card-text">
        <strong className="card-name">{group.name}</strong>
        <span className="card-members">{group.members.join(", ")}</span>
      </div>
      <div className="card-actions">
        <button
          type="button"
          className="btn btn-primary"
          aria-label={`Request ${group.name}`}
          disabled={!canRequest || locked}
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
