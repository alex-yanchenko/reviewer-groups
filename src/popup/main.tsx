import { createRoot } from "react-dom/client";
import { loadGroups, saveGroups, type GroupsArea } from "../groups/storage";
import { readActiveTab, requestReviewInTab } from "./activeTab";
import { App, type GroupStore } from "./App";
import "./popup.css";

const syncArea: GroupsArea = chrome.storage.sync;

const store: GroupStore = {
  load: () => loadGroups(syncArea),
  save: (groups) => saveGroups(syncArea, groups),
};

const mount = async () => {
  const container = document.getElementById("root");
  if (container === null) return;
  const tab = await readActiveTab();
  createRoot(container).render(
    <App
      store={store}
      newId={() => crypto.randomUUID()}
      pullRequest={tab?.pullRequest ?? null}
      requestReview={(members) =>
        tab === null
          ? Promise.resolve({ ok: false, error: "No active tab." })
          : requestReviewInTab(tab.id, members)
      }
    />,
  );
};

void mount();
