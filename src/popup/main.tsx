import { createRoot } from "react-dom/client";
import { loadGroups, saveGroups, type StorageArea } from "../groups/storage";
import type { ListReviewersReply, RequestReviewReply } from "../messages";
import { listReviewersInTab, readActiveTab, requestReviewInTab } from "./activeTab";
import { App, type DirectoryStore, type DraftStore, type GroupStore } from "./App";
import { loadDirectory, saveDirectory } from "./directory";
import { loadDraft, saveDraft } from "./draft";
import "./popup.css";

const syncArea: StorageArea = chrome.storage.sync;
const sessionArea: StorageArea = chrome.storage.session;
const localArea: StorageArea = chrome.storage.local;

const store: GroupStore = {
  load: () => loadGroups(syncArea),
  save: (groups) => saveGroups(syncArea, groups),
};

const drafts: DraftStore = {
  load: () => loadDraft(sessionArea),
  save: (draft) => saveDraft(sessionArea, draft),
};

const directory: DirectoryStore = {
  load: () => loadDirectory(localArea),
  save: (people) => saveDirectory(localArea, people),
};

const NO_TAB = { ok: false, error: "No active tab." } as const;

const mount = async () => {
  const container = document.getElementById("root");
  if (container === null) return;
  const tab = await readActiveTab();
  const requestReview = (members: string[]): Promise<RequestReviewReply> =>
    tab === null ? Promise.resolve(NO_TAB) : requestReviewInTab(tab.id, members);
  const listReviewers = (query: string): Promise<ListReviewersReply> =>
    tab === null ? Promise.resolve(NO_TAB) : listReviewersInTab(tab.id, query);
  createRoot(container).render(
    <App
      store={store}
      drafts={drafts}
      directory={directory}
      newId={() => crypto.randomUUID()}
      pullRequest={tab?.pullRequest ?? null}
      requestReview={requestReview}
      listReviewers={listReviewers}
    />,
  );
};

void mount();
