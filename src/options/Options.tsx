import { useState, type ChangeEvent } from "react";
import {
  exportGroups,
  GROUP_FILE_NAME,
  mergeImportedGroups,
  readGroupFile,
  type ImportMerge,
} from "../groups/groupFile";
import { joinSentences, listSentence } from "../messages";
import type { GroupStore } from "../popup/App";

export interface OptionsProps {
  store: GroupStore;
  download: (fileName: string, text: string) => void;
  newId: () => string;
}

type Report = { kind: "status" | "problem"; text: string } | null;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const countOfGroups = (count: number) => (count === 1 ? "1 group" : `${count} groups`);

const MAX_FILE_BYTES = 1_048_576;

const countStored = async (
  store: GroupStore,
  addedIds: string[],
): Promise<{ stored: number } | { error: unknown }> => {
  try {
    const { groups } = await store.load();
    return { stored: groups.filter((group) => addedIds.includes(group.id)).length };
  } catch (error) {
    return { error };
  }
};

const importedSentences = async (store: GroupStore, merge: ImportMerge): Promise<string[]> => {
  if (merge.addedIds.length === 0) return ["Imported 0 groups."];
  const counted = await countStored(store, merge.addedIds);
  if ("error" in counted) {
    return [
      `Imported ${countOfGroups(merge.addedIds.length)}.`,
      `Reading the groups back failed, so this count is unconfirmed: ${messageOf(counted.error)}`,
    ];
  }
  const notStored = merge.addedIds.length - counted.stored;
  return [
    `Imported ${countOfGroups(counted.stored)}.`,
    notStored > 0 ? `Did not store ${countOfGroups(notStored)}.` : "",
  ];
};

const importReport = async (store: GroupStore, text: string, newId: () => string): Promise<Report> => {
  const reading = readGroupFile(text);
  if (!reading.ok) return { kind: "problem", text: reading.error };
  const before = await store.load();
  const merge = mergeImportedGroups(before.groups, reading.groups, newId);
  if (merge.addedIds.length > 0) {
    try {
      await store.save(merge.groups);
    } catch (error) {
      return { kind: "problem", text: `Nothing was imported. ${messageOf(error)}` };
    }
  }
  return {
    kind: "status",
    text: joinSentences([
      ...(await importedSentences(store, merge)),
      merge.skipped > 0 ? `Skipped ${merge.skipped} already saved.` : "",
      listSentence("Could not be read, so not checked for duplicates: ", before.unreadableNames),
    ]),
  };
};

export function Options({ store, download, newId }: OptionsProps) {
  const [report, setReport] = useState<Report>(null);

  const exportAll = async () => {
    try {
      const { groups, unreadableNames } = await store.load();
      download(GROUP_FILE_NAME, exportGroups(groups));
      setReport({
        kind: "status",
        text: joinSentences([
          `Exported ${countOfGroups(groups.length)}.`,
          listSentence("Could not be read, so left out of the file: ", unreadableNames),
        ]),
      });
    } catch (error) {
      setReport({ kind: "problem", text: `Groups could not be read: ${messageOf(error)}` });
    }
  };

  const importChosenFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    setReport(null);
    if (file.size > MAX_FILE_BYTES) {
      setReport({ kind: "problem", text: "This file is larger than 1 MB, so it was not read." });
      return;
    }
    try {
      setReport(await importReport(store, await file.text(), newId));
    } catch (error) {
      setReport({ kind: "problem", text: `Groups could not be read: ${messageOf(error)}` });
    }
  };

  return (
    <main className="options">
      <h1>Reviewer Groups</h1>
      <section className="panel">
        <h2>Export</h2>
        <p>Saves every group, with its repositories and how many it asks, to a {GROUP_FILE_NAME} file.</p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => void exportAll()}>
            Export groups
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Import</h2>
        <p>
          Adds the groups in an exported file. A group with the same name and members as a saved one is
          skipped.
        </p>
        <label className="field">
          <span>Import groups from a file</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(event) => void importChosenFile(event)}
          />
        </label>
      </section>
      {report?.kind === "status" && (
        <p className="status" role="status">
          {report.text}
        </p>
      )}
      {report?.kind === "problem" && (
        <p className="problem" role="alert">
          {report.text}
        </p>
      )}
    </main>
  );
}
