import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListReviewersReply } from "../messages";
import { candidate, isTicked, renderApp, tick } from "./testing/renderApp";

afterEach(cleanup);

const onThePullRequest: ListReviewersReply = {
  ok: true,
  candidates: [
    candidate("ada-dev", { requested: true }),
    candidate("helper-app[bot]", { requested: true }),
    candidate("acme/web", { team: true, requested: true }),
    candidate("grace-ops"),
    candidate("linus-qa"),
  ],
  reviewed: [],
};

const gettingStarted = () => screen.queryByRole("region", { name: "Getting started" });

describe("App the first time it is used", () => {
  it("explains how it works when there are no groups", async () => {
    renderApp({ pullRequest: null });

    const intro = await screen.findByRole("region", { name: "Getting started" });

    expect(intro.textContent).toContain("Tick people and request them in one click.");
    expect(intro.textContent).toContain("Save the people you ask often as a group");
  });

  it("ticks the people already requested on the pull request, bots aside, so they can be saved as a group", async () => {
    const { save } = renderApp({ candidates: onThePullRequest });

    await screen.findByRole("button", { name: "Save as group" });
    expect(["ada-dev", "helper-app[bot]", "acme/web", "grace-ops"].map(isTicked)).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(
      within(screen.getByRole("region", { name: "Getting started" })).getByText(
        "The 2 already requested here are ticked, so Save as group keeps them.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save as group" }));
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Web" } });
    fireEvent.click(screen.getByRole("button", { name: "Save group" }));

    expect(save).toHaveBeenCalledWith([{ id: "new-id", name: "Web", members: ["ada-dev", "acme/web"] }]);
  });

  it("adds them to people ticked earlier", async () => {
    renderApp({ candidates: onThePullRequest, draft: { selection: ["linus-qa"], editingGroupId: null } });

    await screen.findByRole("button", { name: "Request 3" });
    expect(["linus-qa", "ada-dev", "acme/web"].map(isTicked)).toEqual([true, true, true]);
  });

  it("ticks them once, so someone unticked stays unticked", async () => {
    renderApp({ candidates: onThePullRequest, searches: { gr: [candidate("grace-ops")] } });
    await screen.findByRole("button", { name: "Request 2" });

    await tick("ada-dev");
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "gr" } });
    await screen.findByRole("button", { name: "Request 1" });
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "" } });
    await screen.findByRole("checkbox", { name: "linus-qa" });

    expect(isTicked("ada-dev")).toBe(false);
  });

  it("remembers in the session draft who it ticked", async () => {
    const { saveDraft } = renderApp({ candidates: onThePullRequest });

    await screen.findByRole("button", { name: "Request 2" });

    expect(saveDraft).toHaveBeenLastCalledWith({
      selection: ["ada-dev", "acme/web"],
      editingGroupId: null,
      firstRunTicked: ["ada-dev", "acme/web"],
    });
  });

  it("ticks nobody when the popup is opened again in the same session, so an unticked person stays unticked", async () => {
    renderApp({
      candidates: onThePullRequest,
      draft: { selection: [], editingGroupId: null, firstRunTicked: ["ada-dev", "acme/web"] },
    });

    await screen.findByRole("checkbox", { name: "ada-dev" });

    expect(["ada-dev", "acme/web", "grace-ops"].map(isTicked)).toEqual([false, false, false]);
  });

  it("keeps the hint about who it ticked while a search is typed", async () => {
    renderApp({ candidates: onThePullRequest, searches: { gr: [candidate("grace-ops")] } });
    await screen.findByRole("button", { name: "Request 2" });

    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "gr" } });
    await vi.waitFor(() => expect(screen.queryByRole("checkbox", { name: "linus-qa" })).toBeNull());

    expect(
      within(screen.getByRole("region", { name: "Getting started" })).getByText(
        "The 2 already requested here are ticked, so Save as group keeps them.",
      ),
    ).toBeTruthy();
  });

  it("stays out of the way once a group exists", async () => {
    renderApp({ groups: [{ id: "g1", name: "Ops", members: ["grace-ops"] }], candidates: onThePullRequest });

    await screen.findByRole("listitem", { name: "Ops" });
    await screen.findByRole("checkbox", { name: "ada-dev" });

    expect(gettingStarted()).toBeNull();
    expect(isTicked("ada-dev")).toBe(false);
  });

  it("stays out of the way when a saved group could not be read", async () => {
    renderApp({ unreadable: 1, pullRequest: null });

    await screen.findByRole("alert");

    expect(gettingStarted()).toBeNull();
  });
});
