import { afterEach, describe, expect, it, vi } from "vitest";
import { pageMessenger } from "../pageMessenger";
import { listReviewersInTab } from "../popup/activeTab";
import { listenToPopup } from "./requestHandler";
import { createFakeGitHub, mountPullRequestPage } from "./testing/fakeGitHub";

type Listener = (message: unknown, sender: object, sendResponse: (response: unknown) => void) => boolean;

const connectPopupToThisPage = () => {
  const listeners: Listener[] = [];
  const runtime: { lastError?: { message: string }; onMessage: object } = {
    onMessage: {
      addListener: (listener: Listener) => listeners.push(listener),
      removeListener: (listener: Listener) => listeners.splice(listeners.indexOf(listener), 1),
    },
  };
  const answer = (callback: (response: unknown) => void, response: unknown, lastError?: string) => {
    if (lastError !== undefined) runtime.lastError = { message: lastError };
    callback(response);
    delete runtime.lastError;
  };
  const sendMessage = (
    _tabId: number,
    message: unknown,
    _options: unknown,
    callback: (response: unknown) => void,
  ) => {
    const waiting = listeners.map((listener) =>
      listener(message, {}, (response) => answer(callback, response)),
    );
    if (!waiting.includes(true))
      answer(callback, undefined, "The message port closed before a response was received.");
  };
  vi.stubGlobal("chrome", { runtime, tabs: { sendMessage }, scripting: { executeScript: vi.fn() } });
  return listeners;
};

afterEach(() => {
  pageMessenger.removeAllListeners();
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
});

describe("listenToPopup", () => {
  it("answers the popup with the page's reply", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([{ id: 101, login: "mona", name: "Mona" }]);
    connectPopupToThisPage();
    listenToPopup(github.page);

    expect(await listReviewersInTab({ id: 7, session: "popup-1" }, "mo")).toEqual({
      ok: true,
      candidates: [
        {
          login: "mona",
          description: "Mona",
          avatarUrl: "https://avatars.githubusercontent.com/u/101",
          team: false,
          requested: false,
          available: true,
          reviewState: null,
        },
      ],
      reviewed: [],
    });
  });

  it("tells the popup the page could not finish when reading GitHub fails unexpectedly", async () => {
    mountPullRequestPage(document);
    const github = createFakeGitHub([]);
    github.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    connectPopupToThisPage();
    listenToPopup(github.page);

    expect(await listReviewersInTab({ id: 7, session: "popup-1" }, "")).toEqual({
      ok: false,
      error: "The page could not finish: Failed to fetch",
    });
  });

  it("ignores a message meant for something else", () => {
    const listeners = connectPopupToThisPage();
    listenToPopup(createFakeGitHub([]).page);
    const sendResponse = vi.fn();

    expect(
      listeners.map((listener) =>
        listener({ id: 1, type: "ping", data: {}, timestamp: 1 }, {}, sendResponse),
      ),
    ).toEqual([false]);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
