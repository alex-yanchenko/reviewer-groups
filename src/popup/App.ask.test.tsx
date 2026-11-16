import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Group } from "../groups/group";
import type { RequestReviewReply } from "../messages";
import { outcome, renderApp } from "./testing/renderApp";

afterEach(cleanup);

const platform: Group = { id: "g1", name: "Platform", members: ["ada-dev", "grace-ops", "linus-qa"], ask: 1 };

const addingEveryone = () =>
  vi
    .fn<(members: string[]) => Promise<RequestReviewReply>>()
    .mockImplementation((members) => Promise.resolve({ ok: true, outcome: outcome({ added: members }) }));

describe("App asking some of a group", () => {
  it("requests only as many as the group asks, the ones with the fewest open requests, and names them", async () => {
    const requestReview = addingEveryone();
    renderApp({
      groups: [platform],
      requestReview,
      openRequestCounts: { "ada-dev": 3, "grace-ops": 1, "linus-qa": 2 },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Request Platform" }));

    expect((await screen.findByRole("status")).textContent).toBe("Picked grace-ops (1 open) from Platform.");
    expect(requestReview).toHaveBeenCalledTimes(1);
    expect(requestReview).toHaveBeenCalledWith(["grace-ops"]);
  });

  it("raises the count of the person it just requested", async () => {
    const { openRequests } = renderApp({
      groups: [platform],
      requestReview: addingEveryone(),
      openRequestCounts: { "ada-dev": 3, "grace-ops": 1, "linus-qa": 2 },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Request Platform" }));

    await screen.findByRole("status");
    expect(openRequests.snapshot().counts["grace-ops"]).toBe(2);
  });

  it("remembers when each person was asked, after requesting a whole group too", async () => {
    const { recordAsked } = renderApp({
      groups: [{ id: "g2", name: "Ops", members: ["ada-dev", "grace-ops"] }],
      requestReview: addingEveryone(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Request Ops" }));

    await screen.findByRole("status");
    expect(recordAsked).toHaveBeenCalledWith(["ada-dev", "grace-ops"]);
  });

  it("shows on the card how many of the group it asks", async () => {
    renderApp({ groups: [platform] });

    const card = await screen.findByRole("listitem", { name: "Platform" });

    expect(within(card).getByText("Asks 1 of 3, fewest open requests first")).toBeTruthy();
  });

  it("saves how many to ask while editing a group", async () => {
    const { save } = renderApp({ groups: [{ id: "g2", name: "Ops", members: ["ada-dev", "grace-ops"] }] });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Ops" }));

    fireEvent.change(await screen.findByLabelText("Ask how many"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(save).toHaveBeenCalledWith([{ id: "g2", name: "Ops", members: ["ada-dev", "grace-ops"], ask: 1 }]);
  });

  it("refuses an ask that is not a whole number of one or more", async () => {
    const { save } = renderApp({ groups: [platform] });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Platform" }));

    fireEvent.change(await screen.findByLabelText("Ask how many"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Ask a whole number of people, 1 or more, or leave it empty for everyone.",
    );
    expect(save).not.toHaveBeenCalled();
  });
});
