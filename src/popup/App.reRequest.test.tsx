import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListReviewersReply, RequestReviewReply } from "../messages";
import { candidate, outcome, renderApp } from "./testing/renderApp";

afterEach(cleanup);

const afterReviews: ListReviewersReply = {
  ok: true,
  candidates: [candidate("ada-dev"), candidate("grace-ops"), candidate("linus-qa"), candidate("joan-ux")],
  reviewed: [
    { login: "ada-dev", reviewState: "changesRequested", requested: false },
    { login: "linus-qa", reviewState: "approved", requested: false },
    { login: "grace-ops", reviewState: "commented", requested: false },
    { login: "joan-ux", reviewState: "commented", requested: true },
  ],
};

const reRequested: ListReviewersReply = {
  ...afterReviews,
  reviewed: afterReviews.reviewed.map((person) => ({ ...person, requested: true })),
};

const requestReviewAdding = (added: string[]) =>
  vi
    .fn<(members: string[]) => Promise<RequestReviewReply>>()
    .mockResolvedValueOnce({ ok: true, outcome: outcome({ added }) });

describe("App re-requesting reviews after a push", () => {
  it("names everyone who reviewed and is not requested again, leaving approvers out", async () => {
    renderApp({ candidates: afterReviews });

    const offer = await screen.findByRole("region", { name: "Re-request reviews" });

    expect(
      within(offer).getByText("Reviewed: ada-dev (changes requested), grace-ops (commented)."),
    ).toBeTruthy();
    expect(within(offer).getByRole("button", { name: "Re-request 2 who reviewed" })).toBeTruthy();
  });

  it("re-requests them all in one request", async () => {
    const requestReview = requestReviewAdding(["ada-dev", "grace-ops"]);
    renderApp({ candidates: afterReviews, requestReview });

    fireEvent.click(await screen.findByRole("button", { name: "Re-request 2 who reviewed" }));

    expect((await screen.findByRole("status")).textContent).toBe("Requested ada-dev, grace-ops.");
    expect(requestReview).toHaveBeenCalledTimes(1);
    expect(requestReview).toHaveBeenCalledWith(["ada-dev", "grace-ops"]);
  });

  it("includes the people who approved once their box is ticked", async () => {
    const requestReview = requestReviewAdding(["ada-dev", "linus-qa", "grace-ops"]);
    renderApp({ candidates: afterReviews, requestReview });

    fireEvent.click(await screen.findByRole("checkbox", { name: "Include 1 who approved" }));
    fireEvent.click(screen.getByRole("button", { name: "Re-request 3 who reviewed" }));

    await screen.findByRole("status");
    expect(requestReview).toHaveBeenCalledWith(["ada-dev", "linus-qa", "grace-ops"]);
    expect(
      within(screen.getByRole("region", { name: "Re-request reviews" })).getByText(
        "Reviewed: ada-dev (changes requested), linus-qa (approved), grace-ops (commented).",
      ),
    ).toBeTruthy();
  });

  it("reads the reviewers again after the request, so the offer goes once GitHub has them requested", async () => {
    const requestReview = requestReviewAdding(["ada-dev", "grace-ops"]);
    const { listReviewers } = renderApp({
      candidates: afterReviews,
      candidatesAfterRequest: reRequested,
      requestReview,
    });

    fireEvent.click(await screen.findByRole("button", { name: "Re-request 2 who reviewed" }));

    await vi.waitFor(() => expect(screen.queryByRole("region", { name: "Re-request reviews" })).toBeNull());
    expect(listReviewers).toHaveBeenCalledTimes(2);
  });

  it("offers only the approvers' box when everyone else is already requested", async () => {
    renderApp({
      candidates: {
        ...afterReviews,
        reviewed: [{ login: "linus-qa", reviewState: "approved", requested: false }],
      },
    });

    const offer = await screen.findByRole("region", { name: "Re-request reviews" });

    expect(
      within(offer).getByRole<HTMLButtonElement>("button", { name: "Re-request 0 who reviewed" }).disabled,
    ).toBe(true);
    expect(within(offer).getByRole("checkbox", { name: "Include 1 who approved" })).toBeTruthy();
  });

  it("offers nothing when everyone who reviewed is requested again", async () => {
    renderApp({ candidates: reRequested });

    await screen.findByRole("list", { name: "People" });

    expect(screen.queryByRole("region", { name: "Re-request reviews" })).toBeNull();
  });
});
