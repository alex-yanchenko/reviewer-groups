import { createRoot } from "react-dom/client";
import { loadGroups, saveGroups, type StorageArea } from "../groups/storage";
import type { ListReviewersReply, LookUpGroupReply, RequestReviewReply } from "../messages";
import {
  countOpenRequestsInTab,
  listReviewersInTab,
  lookUpGroupInTab,
  readActiveTab,
  requestReviewInTab,
} from "./activeTab";
import { App, type DirectoryStore, type DraftStore, type GroupStore } from "./App";
import { loadDirectory, saveDirectory } from "./directory";
import { loadDraft, saveDraft } from "./draft";
import { OpenRequestCounter } from "./openRequestCounter";
import { rotationStore } from "./rotation";
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
  const popupTab = tab === null ? null : { id: tab.id, session: crypto.randomUUID() };
  const requestReview = (members: string[]): Promise<RequestReviewReply> =>
    popupTab === null ? Promise.resolve(NO_TAB) : requestReviewInTab(popupTab, members);
  const listReviewers = (query: string): Promise<ListReviewersReply> =>
    popupTab === null ? Promise.resolve(NO_TAB) : listReviewersInTab(popupTab, query);
  const lookUpGroup = (members: string[]): Promise<LookUpGroupReply> =>
    popupTab === null ? Promise.resolve(NO_TAB) : lookUpGroupInTab(popupTab, members);
  const openRequests = new OpenRequestCounter({
    countInTab: (login) =>
      popupTab === null
        ? Promise.resolve({ ...NO_TAB, limited: false })
        : countOpenRequestsInTab(popupTab, login),
    area: sessionArea,
  });
  createRoot(container).render(
    <App
      store={store}
      drafts={drafts}
      directory={directory}
      newId={() => crypto.randomUUID()}
      pullRequest={tab?.pullRequest ?? null}
      requestReview={requestReview}
      listReviewers={listReviewers}
      lookUpGroup={lookUpGroup}
      openRequests={openRequests}
      rotation={rotationStore(localArea)}
    />,
  );
};

void mount();
