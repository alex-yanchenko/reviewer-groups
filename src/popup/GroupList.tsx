import type { Group } from "../groups/group";
import { isGone, type Directory } from "./directory";
import { GroupCard } from "./GroupCard";
import { GroupForm, type GroupDraft } from "./GroupForm";
import type { PlacedGroup } from "./groupSettings";

export interface GroupActions {
  onRequest: (group: Group) => void;
  onEdit: (group: Group) => void;
  onDelete: (group: Group) => void;
  onRemoveMissing: (group: Group) => void;
  onSaveTyped: (draft: GroupDraft) => void;
  onCancelTyped: () => void;
}

export function GroupList({
  placed,
  directory,
  typedEditGroupId,
  pickerEditGroupId,
  canRequest,
  busy,
  actions,
}: {
  placed: PlacedGroup<Group>[];
  directory: Directory;
  typedEditGroupId: string | null;
  pickerEditGroupId: string | null;
  canRequest: boolean;
  busy: string | null;
  actions: GroupActions;
}) {
  return (
    <ul className="cards" aria-label="Groups">
      {placed.map(({ group, linked }) =>
        typedEditGroupId === group.id ? (
          <li key={group.id} className="card card-editing">
            <GroupForm initial={group} onSave={actions.onSaveTyped} onCancel={actions.onCancelTyped} />
          </li>
        ) : (
          <GroupCard
            key={group.id}
            group={group}
            linked={linked}
            goneMembers={group.members.filter((member) => isGone(directory, member))}
            canRequest={canRequest}
            busy={busy === group.id}
            locked={busy !== null}
            editing={pickerEditGroupId === group.id}
            onRequest={() => actions.onRequest(group)}
            onEdit={() => actions.onEdit(group)}
            onDelete={() => actions.onDelete(group)}
            onRemoveMissing={() => actions.onRemoveMissing(group)}
          />
        ),
      )}
    </ul>
  );
}
