import { handleExtensionMessage, isExtensionMessage } from "./requestHandler";

const LISTENING_FLAG = "__reviewerGroupsListening";

const replyUnexpectedFailure = (error: unknown) => ({
  ok: false,
  error: `The page could not finish: ${error instanceof Error ? error.message : String(error)}`,
});

const page = { doc: document, fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init) };

if (!(LISTENING_FLAG in globalThis)) {
  Object.defineProperty(globalThis, LISTENING_FLAG, { value: true });
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isExtensionMessage(message)) return false;
    handleExtensionMessage(page, message).then(sendResponse, (error: unknown) =>
      sendResponse(replyUnexpectedFailure(error)),
    );
    return true;
  });
}
