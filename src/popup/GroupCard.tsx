import type { Group } from "../groups/group";

function MemberList({ members, goneMembers }: { members: string[]; goneMembers: string[] }) {
  if (goneMembers.length === 0) return <span className="card-members">{members.join(", ")}</span>;
  const gone = new Set(goneMembers);
  return (
    <span className="card-members">
      {members.map((member, index) => (
        <span key={member}>
          {index > 0 && ", "}
          <span
            className={gone.has(member) ? "member member-gone" : "member"}
            title={gone.has(member) ? "No longer on GitHub" : undefined}
          >
            {member}
          </span>
        </span>
      ))}
    </span>
  );
}

function MissingMembersNotice({
  group,
  goneMembers,
  onRemoveMissing,
}: {
  group: Group;
  goneMembers: string[];
  onRemoveMissing: () => void;
}) {
  if (goneMembers.length === 0) return null;
  if (goneMembers.length === group.members.length) {
    return <p className="card-warning">Every member is no longer on GitHub. Delete the group or edit it.</p>;
  }
  return (
    <p className="card-warning">
      {goneMembers.length === 1
        ? "1 member is no longer on GitHub."
        : `${goneMembers.length} members are no longer on GitHub.`}{" "}
      <button
        type="button"
        className="link-button"
        aria-label={`Remove missing members from ${group.name}`}
        onClick={onRemoveMissing}
      >
        Remove
      </button>
    </p>
  );
}

export function GroupCard({
  group,
  goneMembers,
  canRequest,
  busy,
  locked,
  editing,
  onRequest,
  onEdit,
  onDelete,
  onRemoveMissing,
}: {
  group: Group;
  goneMembers: string[];
  canRequest: boolean;
  busy: boolean;
  locked: boolean;
  editing: boolean;
  onRequest: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRemoveMissing: () => void;
}) {
  return (
    <li className={editing ? "card card-editing" : "card"} aria-label={group.name}>
      <div className="card-text">
        <strong className="card-name">{group.name}</strong>
        <MemberList members={group.members} goneMembers={goneMembers} />
        <MissingMembersNotice group={group} goneMembers={goneMembers} onRemoveMissing={onRemoveMissing} />
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
