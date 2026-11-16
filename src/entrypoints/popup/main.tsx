import { createRoot } from "react-dom/client";
import { loadGroups, saveGroups, type StorageArea } from "../../groups/storage";
import type {
  ListReviewersReply,
  LookUpGroupReply,
  RemoveReviewersReply,
  RequestReviewReply,
} from "../../messages";
import {
  countOpenRequestsInTab,
  listReviewersInTab,
  lookUpGroupInTab,
  readActiveTab,
  removeReviewersInTab,
  requestReviewInTab,
} from "../../popup/activeTab";
import { App, type DirectoryStore, type DraftStore, type GroupStore } from "../../popup/App";
import { loadDirectory, saveDirectory } from "../../popup/directory";
import { loadDraft, saveDraft } from "../../popup/draft";
import { OpenRequestCounter } from "../../popup/openRequestCounter";
import { rotationStore } from "../../popup/rotation";
import "../../popup/popup.css";

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
  const pullRequest = tab?.pullRequest ?? null;
  const requestReview = (members: string[]): Promise<RequestReviewReply> =>
    popupTab === null || pullRequest === null
      ? Promise.resolve(NO_TAB)
      : requestReviewInTab(popupTab, pullRequest, members);
  const listReviewers = (query: string): Promise<ListReviewersReply> =>
    popupTab === null ? Promise.resolve(NO_TAB) : listReviewersInTab(popupTab, query);
  const lookUpGroup = (members: string[]): Promise<LookUpGroupReply> =>
    popupTab === null ? Promise.resolve(NO_TAB) : lookUpGroupInTab(popupTab, members);
  const removeReviewers = (members: string[]): Promise<RemoveReviewersReply> =>
    popupTab === null || pullRequest === null
      ? Promise.resolve(NO_TAB)
      : removeReviewersInTab(popupTab, pullRequest, members);
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
      pullRequest={pullRequest}
      requestReview={requestReview}
      listReviewers={listReviewers}
      lookUpGroup={lookUpGroup}
      openRequests={openRequests}
      rotation={rotationStore(localArea)}
      openOptions={() => void chrome.runtime.openOptionsPage()}
      removeReviewers={removeReviewers}
    />,
  );
};

void mount();
