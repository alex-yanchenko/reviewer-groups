import { createRoot } from "react-dom/client";
import { loadGroups, saveGroups, type StorageArea } from "../groups/storage";
import type { GroupStore } from "../popup/App";
import "../popup/popup.css";
import "./options.css";
import { Options } from "./Options";

const syncArea: StorageArea = chrome.storage.sync;

const store: GroupStore = {
  load: () => loadGroups(syncArea),
  save: (groups) => saveGroups(syncArea, groups),
};

const download = (fileName: string, text: string) => {
  const address = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = address;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(address);
};

const container = document.getElementById("root");
if (container !== null) {
  createRoot(container).render(
    <Options store={store} download={download} newId={() => crypto.randomUUID()} />,
  );
}
