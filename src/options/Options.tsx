import { useState, type ChangeEvent } from "react";
import { exportGroups, GROUP_FILE_NAME, mergeImportedGroups, readGroupFile } from "../groups/groupFile";
import { joinSentences } from "../messages";
import type { GroupStore } from "../popup/App";

export interface OptionsProps {
  store: GroupStore;
  download: (fileName: string, text: string) => void;
  newId: () => string;
}

type Report = { kind: "status" | "problem"; text: string } | null;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const countOfGroups = (count: number) => (count === 1 ? "1 group" : `${count} groups`);

const importReport = async (store: GroupStore, text: string, newId: () => string): Promise<Report> => {
  const reading = readGroupFile(text);
  if (!reading.ok) return { kind: "problem", text: reading.error };
  const merge = mergeImportedGroups((await store.load()).groups, reading.groups, newId);
  if (merge.addedIds.length > 0) {
    try {
      await store.save(merge.groups);
    } catch (error) {
      return { kind: "problem", text: `Nothing was imported. ${messageOf(error)}` };
    }
  }
  const stored = (await store.load()).groups.filter((group) => merge.addedIds.includes(group.id)).length;
  return {
    kind: "status",
    text: joinSentences([
      `Imported ${countOfGroups(stored)}.`,
      merge.skipped > 0 ? `Skipped ${merge.skipped} already saved.` : "",
    ]),
  };
};

export function Options({ store, download, newId }: OptionsProps) {
  const [report, setReport] = useState<Report>(null);

  const exportAll = async () => {
    try {
      const { groups } = await store.load();
      download(GROUP_FILE_NAME, exportGroups(groups));
      setReport({ kind: "status", text: `Exported ${countOfGroups(groups.length)}.` });
    } catch (error) {
      setReport({ kind: "problem", text: `Groups could not be read: ${messageOf(error)}` });
    }
  };

  const importChosenFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    setReport(null);
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
