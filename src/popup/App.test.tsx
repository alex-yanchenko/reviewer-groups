import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Group } from "../groups/group";
import type { RequestReviewReply } from "../messages";
import { App, type GroupStore } from "./App";

const backend: Group = { id: "g1", name: "Backend", members: ["mona", "hubot"] };

const buildStore = (groups: Group[]) => {
  const load = vi.fn<GroupStore["load"]>().mockResolvedValueOnce(groups);
  const save = vi.fn<GroupStore["save"]>().mockResolvedValue(undefined);
  return { store: { load, save } satisfies GroupStore, save };
};

const renderApp = (
  groups: Group[],
  requestReview = vi.fn<(members: string[]) => Promise<RequestReviewReply>>(),
  pullRequest: string | null = "acme/widgets#7",
) => {
  const { store, save } = buildStore(groups);
  render(
    <App store={store} requestReview={requestReview} newId={() => "new-id"} pullRequest={pullRequest} />,
  );
  return { save, requestReview };
};

const fillGroupForm = (name: string, members: string) => {
  fireEvent.change(screen.getByLabelText("Group name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Members"), { target: { value: members } });
  fireEvent.click(screen.getByRole("button", { name: "Save group" }));
};

afterEach(cleanup);

describe("App", () => {
  it("lists each saved group with its members", async () => {
    renderApp([backend]);

    const card = await screen.findByRole("listitem", { name: "Backend" });

    expect(within(card).getByText("mona, hubot")).toBeTruthy();
  });

  it("saves a new group from a name and a member list", async () => {
    const { save } = renderApp([backend]);
    fireEvent.click(await screen.findByRole("button", { name: "New group" }));

    fillGroupForm("Frontend", "@octocat,\nhubot");

    expect(await screen.findByRole("listitem", { name: "Frontend" })).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([
      backend,
      { id: "new-id", name: "Frontend", members: ["octocat", "hubot"] },
    ]);
  });

  it("names the entries that are not GitHub logins and saves nothing", async () => {
    const { save } = renderApp([]);
    fireEvent.click(await screen.findByRole("button", { name: "New group" }));

    fillGroupForm("Frontend", "octocat not!valid");

    expect((await screen.findByRole("alert")).textContent).toBe("Not GitHub logins: not!valid");
    expect(save).not.toHaveBeenCalled();
  });

  it("asks for a name before saving", async () => {
    const { save } = renderApp([]);
    fireEvent.click(await screen.findByRole("button", { name: "New group" }));

    fillGroupForm("  ", "octocat");

    expect((await screen.findByRole("alert")).textContent).toBe("Give the group a name.");
    expect(save).not.toHaveBeenCalled();
  });

  it("asks for at least one member before saving", async () => {
    const { save } = renderApp([]);
    fireEvent.click(await screen.findByRole("button", { name: "New group" }));

    fillGroupForm("Frontend", " ");

    expect((await screen.findByRole("alert")).textContent).toBe("Add at least one GitHub login.");
    expect(save).not.toHaveBeenCalled();
  });

  it("saves an edited group in place", async () => {
    const { save } = renderApp([backend]);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Backend" }));

    fillGroupForm("Backend", "mona octocat");

    expect(await screen.findByText("mona, octocat")).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([{ id: "g1", name: "Backend", members: ["mona", "octocat"] }]);
  });

  it("deletes a group", async () => {
    const { save } = renderApp([backend]);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Backend" }));

    expect(await screen.findByText("No groups yet.")).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([]);
  });

  it("requests review from a group and reports what happened", async () => {
    const requestReview = vi.fn<(members: string[]) => Promise<RequestReviewReply>>().mockResolvedValueOnce({
      ok: true,
      outcome: { added: ["mona"], alreadyRequested: ["hubot"], notFound: [] },
    });
    renderApp([backend], requestReview);

    fireEvent.click(await screen.findByRole("button", { name: "Request Backend" }));

    expect((await screen.findByRole("status")).textContent).toBe("Requested mona. Already requested: hubot.");
    expect(requestReview).toHaveBeenCalledTimes(1);
    expect(requestReview).toHaveBeenCalledWith(["mona", "hubot"]);
  });

  it("names the pull request a group would be requested on", async () => {
    renderApp([backend]);

    expect(await screen.findByText("acme/widgets#7")).toBeTruthy();
  });

  it("offers no request outside a pull request and says where to go", async () => {
    const { requestReview } = renderApp([backend], undefined, null);

    const request = await screen.findByRole("button", { name: "Request Backend" });

    expect(request.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Open a GitHub pull request to request review.")).toBeTruthy();
    fireEvent.click(request);
    expect(requestReview).not.toHaveBeenCalled();
  });

  it("shows why stored groups could not be read", async () => {
    const load = vi.fn<GroupStore["load"]>().mockRejectedValueOnce(new Error("groups[0].members: too small"));
    const save = vi.fn<GroupStore["save"]>();
    render(<App store={{ load, save }} requestReview={vi.fn()} newId={() => "new-id"} pullRequest={null} />);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Saved groups could not be read: groups[0].members: too small",
    );
  });

  it("shows why a request could not be made", async () => {
    const requestReview = vi
      .fn<(members: string[]) => Promise<RequestReviewReply>>()
      .mockResolvedValueOnce({ ok: false, error: "Open a GitHub pull request in this tab first." });
    renderApp([backend], requestReview);

    fireEvent.click(await screen.findByRole("button", { name: "Request Backend" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      "Open a GitHub pull request in this tab first.",
    );
  });
});
