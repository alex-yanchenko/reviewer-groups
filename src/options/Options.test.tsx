import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Group } from "../groups/group";
import { SyncQuotaError } from "../groups/storage";
import type { GroupStore } from "../popup/App";
import { Options } from "./Options";

afterEach(cleanup);

const platform: Group = { id: "g1", name: "Platform", members: ["ada-dev", "grace-ops"], ask: 1 };
const docsSite: Group = { id: "g2", name: "Docs site", members: ["joan-ux"], repos: ["northwind/docs"] };

const renderOptions = ({
  groups = [platform],
  keepOnSave = (saved: Group[]) => saved,
  saveFailure,
  unreadableNames = [],
  rereadFailure,
}: {
  groups?: Group[];
  keepOnSave?: (saved: Group[]) => Group[];
  saveFailure?: Error;
  unreadableNames?: string[];
  rereadFailure?: Error;
} = {}) => {
  let stored = groups;
  let saved = false;
  const load = vi.fn<GroupStore["load"]>(() =>
    saved && rereadFailure !== undefined
      ? Promise.reject(rereadFailure)
      : Promise.resolve({ groups: stored, unreadable: unreadableNames.length, unreadableNames }),
  );
  const save = vi.fn<GroupStore["save"]>((next) => {
    if (saveFailure !== undefined) return Promise.reject(saveFailure);
    stored = keepOnSave(next);
    saved = true;
    return Promise.resolve();
  });
  const download = vi.fn<(fileName: string, text: string) => void>();
  let next = 0;
  const newId = () => {
    next += 1;
    return `new-${next}`;
  };
  render(<Options store={{ load, save }} download={download} newId={newId} />);
  return { save, download };
};

const importFile = async (contents: unknown) => {
  const file = new File([typeof contents === "string" ? contents : JSON.stringify(contents)], "groups.json", {
    type: "application/json",
  });
  fireEvent.change(await screen.findByLabelText("Import groups from a file"), { target: { files: [file] } });
};

describe("Options", () => {
  it("exports every saved group to groups.json", async () => {
    const { download } = renderOptions({ groups: [platform, docsSite] });

    fireEvent.click(await screen.findByRole("button", { name: "Export groups" }));

    expect((await screen.findByRole("status")).textContent).toBe("Exported 2 groups.");
    expect(download).toHaveBeenCalledTimes(1);
    const [fileName, text] = download.mock.calls[0] ?? [];
    expect(fileName).toBe("groups.json");
    expect(JSON.parse(text ?? "")).toEqual({ version: 1, groups: [platform, docsSite] });
  });

  it("imports the groups in a file, skips the ones already saved, and says how many of each", async () => {
    const { save } = renderOptions();

    await importFile({ version: 1, groups: [{ ...platform, id: "elsewhere" }, docsSite] });

    expect((await screen.findByRole("status")).textContent).toBe(
      "Imported 1 group. Skipped 1 already saved.",
    );
    expect(save).toHaveBeenCalledWith([platform, { ...docsSite, id: "new-1" }]);
  });

  it("counts only the groups Chrome actually stored", async () => {
    renderOptions({ keepOnSave: (saved) => saved.slice(0, 2) });

    await importFile({
      version: 1,
      groups: [docsSite, { name: "Ops", members: ["linus-qa"] }],
    });

    expect((await screen.findByRole("status")).textContent).toBe("Imported 1 group. Did not store 1 group.");
  });

  it("names the groups it could not read and left out of an export", async () => {
    renderOptions({ unreadableNames: ["Broken", "group 3"] });

    fireEvent.click(await screen.findByRole("button", { name: "Export groups" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      "Exported 1 group. Could not be read, so left out of the file: Broken, group 3.",
    );
  });

  it("names the groups it could not read when reporting an import", async () => {
    renderOptions({ unreadableNames: ["Broken"] });

    await importFile({ version: 1, groups: [docsSite] });

    expect((await screen.findByRole("status")).textContent).toBe(
      "Imported 1 group. Could not be read, so not checked for duplicates: Broken.",
    );
  });

  it("does not call an import failed when only reading the groups back failed", async () => {
    renderOptions({ rereadFailure: new Error("Chrome sync is unavailable.") });

    await importFile({ version: 1, groups: [docsSite] });

    expect((await screen.findByRole("status")).textContent).toBe(
      "Imported 1 group. Reading the groups back failed, so this count is unconfirmed: Chrome sync is unavailable.",
    );
  });

  it("refuses a file over 1 MB without reading it", async () => {
    const { save } = renderOptions();

    await importFile("x".repeat(1_048_577));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This file is larger than 1 MB, so it was not read.",
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses a file from a newer version and saves nothing", async () => {
    const { save } = renderOptions();

    await importFile({ version: 2, groups: [docsSite] });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This file comes from a newer version of Reviewer Groups. Update the extension, then import it.",
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("reports an import over Chrome's sync quota, which saves none of it", async () => {
    renderOptions({ saveFailure: new SyncQuotaError(140_000) });

    await importFile({ version: 1, groups: [docsSite] });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Nothing was imported. These groups need 137 KB of Chrome sync storage, which holds 100 KB.",
    );
  });

  it("says when a file holds only groups already saved", async () => {
    const { save } = renderOptions();

    await importFile({ version: 1, groups: [platform] });

    expect((await screen.findByRole("status")).textContent).toBe(
      "Imported 0 groups. Skipped 1 already saved.",
    );
    expect(save).not.toHaveBeenCalled();
  });
});
