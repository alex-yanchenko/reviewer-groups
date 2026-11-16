import { useCallback, useEffect, useRef, useState } from "react";
import type { Group } from "../groups/group";
import type { StoredGroups } from "../groups/storage";
import { EMPTY_DIRECTORY, type Directory } from "./directory";
import { EMPTY_DRAFT, type Draft } from "./draft";

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

export const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const describeUnreadableGroups = (count: number) => {
  if (count === 0) return "";
  return count === 1
    ? "1 saved group could not be read and was left out."
    : `${count} saved groups could not be read and were left out.`;
};

export const useSavedState = ({
  store,
  drafts,
  directoryStore,
}: {
  store: GroupStore;
  drafts: DraftStore;
  directoryStore: DirectoryStore;
}) => {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [unreadable, setUnreadable] = useState(0);
  const [loadProblem, setLoadProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [draftReady, setDraftReady] = useState(false);
  const [directory, setDirectory] = useState<Directory>(EMPTY_DIRECTORY);
  const [directoryReady, setDirectoryReady] = useState(false);
  const directoryRef = useRef<Directory>(EMPTY_DIRECTORY);

  useEffect(() => {
    store.load().then(
      (stored) => {
        setGroups(stored.groups);
        setUnreadable(stored.unreadable);
        setNotice(describeUnreadableGroups(stored.unreadable));
      },
      (error: unknown) => setLoadProblem(`Saved groups could not be read: ${messageOf(error)}`),
    );
    void drafts
      .load()
      .then((saved) => setDraft((current) => (current === EMPTY_DRAFT ? saved : current)))
      .finally(() => setDraftReady(true));
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

  return {
    groups,
    unreadable,
    loadProblem,
    notice,
    draft,
    draftReady,
    directory,
    directoryReady,
    updateDirectory,
    updateDraft,
    persist,
  };
};
