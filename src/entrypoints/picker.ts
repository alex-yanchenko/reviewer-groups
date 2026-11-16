import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { ConversationCache, type GitHubPage } from "../content/githubPage";
import { listenOncePerVersion } from "../content/listener";
import { listenToPopup } from "../content/requestHandler";

export default defineUnlistedScript(() => {
  const page: GitHubPage = {
    doc: document,
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
    conversation: new ConversationCache(),
  };

  listenOncePerVersion(globalThis, chrome.runtime.getManifest().version, () => listenToPopup(page));
});
