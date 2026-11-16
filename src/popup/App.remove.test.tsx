import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Group } from "../groups/group";
import type { RemoveReviewersReply, RequestReviewReply } from "../messages";
import { outcome, renderApp } from "./testing/renderApp";

afterEach(cleanup);

const ops: Group = { id: "g1", name: "Ops", members: ["ada-dev", "grace-ops", "linus-qa"] };

const requestAdding = (added: string[], alreadyRequested: string[] = []) =>
  vi
    .fn<(members: string[]) => Promise<RequestReviewReply>>()
    .mockResolvedValue({ ok: true, outcome: outcome({ added, alreadyRequested }) });

describe("App removing the people just requested", () => {
  it("offers to remove the people the last request added, and removes them", async () => {
    const removeReviewers = vi
      .fn<(members: string[]) => Promise<RemoveReviewersReply>>()
      .mockResolvedValueOnce({
        ok: true,
        outcome: { removed: ["ada-dev"], notRequested: ["grace-ops"], unconfirmed: [] },
      });
    renderApp({
      groups: [ops],
      requestReview: requestAdding(["ada-dev", "grace-ops"], ["linus-qa"]),
      removeReviewers,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Request Ops" }));
    const offer = await screen.findByRole("region", { name: "Remove the people just requested" });
    expect(within(offer).getByText("GitHub has already notified them.")).toBeTruthy();
    fireEvent.click(within(offer).getByRole("button", { name: "Remove ada-dev, grace-ops" }));

    expect(
      (await screen.findByText("Removed ada-dev. No longer requested: grace-ops.")).getAttribute("role"),
    ).toBe("status");
    expect(removeReviewers).toHaveBeenCalledWith(["ada-dev", "grace-ops"]);
    expect(screen.queryByRole("region", { name: "Remove the people just requested" })).toBeNull();
  });

  it("makes no offer after a request that added nobody", async () => {
    renderApp({ groups: [ops], requestReview: requestAdding([], ["ada-dev"]) });

    fireEvent.click(await screen.findByRole("button", { name: "Request Ops" }));

    await screen.findByRole("status");
    expect(screen.queryByRole("region", { name: "Remove the people just requested" })).toBeNull();
  });

  it("offers only the people the latest request added", async () => {
    const requestReview = vi
      .fn<(members: string[]) => Promise<RequestReviewReply>>()
      .mockResolvedValueOnce({ ok: true, outcome: outcome({ added: ["ada-dev"] }) })
      .mockResolvedValueOnce({ ok: true, outcome: outcome({ added: ["linus-qa"] }) });
    renderApp({ groups: [ops, { id: "g2", name: "QA", members: ["linus-qa"] }], requestReview });

    fireEvent.click(await screen.findByRole("button", { name: "Request Ops" }));
    await screen.findByRole("button", { name: "Remove ada-dev" });
    fireEvent.click(screen.getByRole("button", { name: "Request QA" }));

    expect(await screen.findByRole("button", { name: "Remove linus-qa" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove ada-dev" })).toBeNull();
  });

  it("keeps the offer and says why when the removal fails", async () => {
    const removeReviewers = vi
      .fn<(members: string[]) => Promise<RemoveReviewersReply>>()
      .mockResolvedValueOnce({
        ok: false,
        error: "This tab now shows a different pull request, so nobody was removed.",
      });
    renderApp({ groups: [ops], requestReview: requestAdding(["ada-dev"]), removeReviewers });

    fireEvent.click(await screen.findByRole("button", { name: "Request Ops" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove ada-dev" }));

    expect(
      await screen.findByText("This tab now shows a different pull request, so nobody was removed."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove ada-dev" })).toBeTruthy();
  });
});
