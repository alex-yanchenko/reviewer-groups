import { useState } from "react";
import type { Group } from "../groups/group";
import {
  describeRemoval,
  describeReply,
  type LookUpGroupReply,
  type RemoveReviewersReply,
  type RequestReviewReply,
} from "../messages";
import { askGroup, asksSome, describeAsk } from "./askGroup";
import type { OpenRequestCounter } from "./openRequestCounter";
import type { RotationStore } from "./rotation";

export const REMOVE_BUSY = "remove";

export interface ReviewRequestTools {
  requestReview: (members: string[]) => Promise<RequestReviewReply>;
  lookUpGroup: (members: string[]) => Promise<LookUpGroupReply>;
  removeReviewers: (members: string[]) => Promise<RemoveReviewersReply>;
  openRequests: OpenRequestCounter;
  rotation: RotationStore;
  onGone: (logins: string[]) => void;
  onWritten: () => void;
}

export const useReviewRequests = ({
  requestReview,
  lookUpGroup,
  removeReviewers,
  openRequests,
  rotation,
  onGone,
  onWritten,
}: ReviewRequestTools) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [justRequested, setJustRequested] = useState<string[]>([]);

  const afterWriting = (added: string[], gone: string[]) => {
    if (gone.length > 0) onGone(gone);
    if (added.length > 0) setJustRequested(added);
    openRequests.bump(added);
    void rotation.record(added).catch(() => undefined);
    onWritten();
  };

  const requestFrom = async (busyKey: string, members: string[]): Promise<RequestReviewReply> => {
    setBusy(busyKey);
    setStatus("");
    const reply = await requestReview(members);
    setBusy(null);
    setStatus(describeReply(reply));
    if (reply.ok) afterWriting(reply.outcome.added, reply.outcome.gone);
    return reply;
  };

  const askSomeOf = async (group: Group): Promise<void> => {
    setBusy(group.id);
    setStatus("");
    const reply = await askGroup(group, {
      lookUp: lookUpGroup,
      count: (login) => openRequests.count(login, { urgent: true }),
      request: requestReview,
      lastAsked: await rotation.load().catch(() => ({})),
    });
    setBusy(null);
    setStatus(reply.ok ? describeAsk(group.name, reply.ask) : reply.error);
    afterWriting(
      reply.ok ? reply.ask.picked.map(({ login }) => login) : reply.added,
      reply.ok ? reply.ask.problems.gone : [],
    );
  };

  const requestGroup = async (group: Group): Promise<void> => {
    if (asksSome(group)) await askSomeOf(group);
    else await requestFrom(group.id, group.members);
  };

  const removeJustRequested = async (): Promise<void> => {
    setBusy(REMOVE_BUSY);
    setStatus("");
    const reply = await removeReviewers(justRequested);
    setBusy(null);
    setStatus(reply.ok ? describeRemoval(reply.outcome) : reply.error);
    if (!reply.ok) return;
    setJustRequested([]);
    onWritten();
  };

  return { busy, status, justRequested, requestFrom, requestGroup, removeJustRequested };
};
