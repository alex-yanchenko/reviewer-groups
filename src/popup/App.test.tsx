import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Group } from "../groups/group";
import type { ListReviewersReply, RequestReviewReply, ReviewerCandidate } from "../messages";
import { App, type Draft, type DraftStore, type GroupStore } from "./App";

const backend: Group = { id: "g1", name: "Backend", members: ["mona", "hubot"] };

const candidate = (login: string, overrides: Partial<ReviewerCandidate> = {}): ReviewerCandidate => ({
  login,
  description: "",
  avatarUrl: null,
  team: false,
  requested: false,
  ...overrides,
});

const reviewers: ReviewerCandidate[] = [
  candidate("mona", { description: "Mona Lisa", avatarUrl: "https://avatars.githubusercontent.com/u/101" }),
  candidate("hubot"),
  candidate("octocat", { requested: true }),
  candidate("acme/backend", { team: true, description: "API owners" }),
];

const emptyDraft: Draft = { selection: [], editingGroupId: null };

interface RenderOptions {
  groups?: Group[];
  pullRequest?: string | null;
  candidates?: ListReviewersReply;
  draft?: Draft;
  requestReview?: (members: string[]) => Promise<RequestReviewReply>;
}

const renderApp = ({
  groups = [],
  pullRequest = "acme/widgets#7",
  candidates = { ok: true, candidates: reviewers },
  draft = emptyDraft,
  requestReview = vi.fn<(members: string[]) => Promise<RequestReviewReply>>(),
}: RenderOptions = {}) => {
  const store = {
    load: vi.fn<GroupStore["load"]>().mockResolvedValueOnce(groups),
    save: vi.fn<GroupStore["save"]>().mockResolvedValue(undefined),
  } satisfies GroupStore;
  const drafts = {
    load: vi.fn<DraftStore["load"]>().mockResolvedValueOnce(draft),
    save: vi.fn<DraftStore["save"]>().mockResolvedValue(undefined),
  } satisfies DraftStore;
  const listReviewers = vi.fn<() => Promise<ListReviewersReply>>().mockResolvedValueOnce(candidates);
  render(
    <App
      store={store}
      drafts={drafts}
      requestReview={requestReview}
      listReviewers={listReviewers}
      newId={() => "new-id"}
      pullRequest={pullRequest}
    />,
  );
  return { save: store.save, saveDraft: drafts.save, listReviewers, requestReview };
};

const tick = async (login: string) => fireEvent.click(await screen.findByRole("checkbox", { name: login }));

const isTicked = (login: string) => screen.getByRole<HTMLInputElement>("checkbox", { name: login }).checked;

const fillGroupForm = (name: string, members: string) => {
  fireEvent.change(screen.getByLabelText("Group name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Members"), { target: { value: members } });
  fireEvent.click(screen.getByRole("button", { name: "Save group" }));
};

afterEach(cleanup);

describe("App on a pull request", () => {
  it("lists everyone GitHub offers as a reviewer, marking who is already requested", async () => {
    renderApp();

    const people = await screen.findByRole("list", { name: "People" });

    expect(
      within(people)
        .getAllByRole("checkbox")
        .map((box) => box.getAttribute("aria-label")),
    ).toEqual(["mona", "hubot", "octocat", "acme/backend"]);
    expect(within(people).getByText("Mona Lisa")).toBeTruthy();
    expect(within(screen.getByRole("listitem", { name: "octocat" })).getByText("requested")).toBeTruthy();
    expect(within(screen.getByRole("listitem", { name: "acme/backend" })).getByText("team")).toBeTruthy();
  });

  it("narrows the list to people whose login or name matches the search", async () => {
    renderApp();
    await screen.findByRole("list", { name: "People" });

    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "lisa" } });

    expect(screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual(["mona"]);
  });

  it("requests review from the ticked people and clears the ticks", async () => {
    const requestReview = vi.fn<(members: string[]) => Promise<RequestReviewReply>>().mockResolvedValueOnce({
      ok: true,
      outcome: { added: ["mona", "hubot"], alreadyRequested: [], notFound: [] },
    });
    const { saveDraft } = renderApp({ requestReview });
    await tick("mona");
    await tick("hubot");

    fireEvent.click(screen.getByRole("button", { name: "Request 2" }));

    expect((await screen.findByRole("status")).textContent).toBe("Requested mona, hubot.");
    expect(requestReview).toHaveBeenCalledTimes(1);
    expect(requestReview).toHaveBeenCalledWith(["mona", "hubot"]);
    expect(isTicked("mona")).toBe(false);
    expect(saveDraft).toHaveBeenLastCalledWith(emptyDraft);
  });

  it("keeps the ticks when the request fails", async () => {
    const requestReview = vi
      .fn<(members: string[]) => Promise<RequestReviewReply>>()
      .mockResolvedValueOnce({ ok: false, error: "GitHub's Reviewers picker did not load its list." });
    renderApp({ requestReview });
    await tick("mona");

    fireEvent.click(screen.getByRole("button", { name: "Request 1" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      "GitHub's Reviewers picker did not load its list.",
    );
    expect(isTicked("mona")).toBe(true);
  });

  it("saves the ticked people as a new group", async () => {
    const { save, saveDraft } = renderApp({ groups: [backend] });
    await tick("octocat");
    await tick("acme/backend");

    fireEvent.click(screen.getByRole("button", { name: "Save as group" }));
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Reviewers" } });
    fireEvent.click(screen.getByRole("button", { name: "Save group" }));

    expect(await screen.findByRole("listitem", { name: "Reviewers" })).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([
      backend,
      { id: "new-id", name: "Reviewers", members: ["octocat", "acme/backend"] },
    ]);
    expect(saveDraft).toHaveBeenLastCalledWith(emptyDraft);
  });

  it("asks for a name before saving the ticked people as a group", async () => {
    const { save } = renderApp();
    await tick("mona");

    fireEvent.click(screen.getByRole("button", { name: "Save as group" }));
    fireEvent.click(screen.getByRole("button", { name: "Save group" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Give the group a name.");
    expect(save).not.toHaveBeenCalled();
  });

  it("records every tick so closing the dropdown loses nothing", async () => {
    const { saveDraft } = renderApp();

    await tick("hubot");

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft).toHaveBeenCalledWith({ selection: ["hubot"], editingGroupId: null });
  });

  it("restores the ticks from the last time the dropdown was open", async () => {
    renderApp({ draft: { selection: ["hubot"], editingGroupId: null } });

    await screen.findByRole("list", { name: "People" });

    expect(isTicked("hubot")).toBe(true);
    expect(screen.getByRole("button", { name: "Request 1" })).toBeTruthy();
  });

  it("edits a group by ticking and unticking people", async () => {
    const { save } = renderApp({ groups: [backend] });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Backend" }));
    expect(isTicked("mona")).toBe(true);
    expect(isTicked("hubot")).toBe(true);

    await tick("hubot");
    await tick("octocat");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("mona, octocat")).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([{ id: "g1", name: "Backend", members: ["mona", "octocat"] }]);
  });

  it("keeps a group member this repository does not offer, ticked, while editing", async () => {
    renderApp({ groups: [{ id: "g2", name: "Mixed", members: ["stranger", "mona"] }] });

    fireEvent.click(await screen.findByRole("button", { name: "Edit Mixed" }));

    expect(isTicked("stranger")).toBe(true);
    expect(
      within(screen.getByRole("listitem", { name: "stranger" })).getByText("not offered on this PR"),
    ).toBeTruthy();
  });

  it("restores an edit in progress after the dropdown reopens", async () => {
    renderApp({ groups: [backend], draft: { selection: ["mona"], editingGroupId: "g1" } });

    expect(await screen.findByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(isTicked("mona")).toBe(true);
    expect(isTicked("hubot")).toBe(false);
  });

  it("requests review from a saved group in one click", async () => {
    const requestReview = vi.fn<(members: string[]) => Promise<RequestReviewReply>>().mockResolvedValueOnce({
      ok: true,
      outcome: { added: ["mona"], alreadyRequested: ["hubot"], notFound: [] },
    });
    renderApp({ groups: [backend], requestReview });

    fireEvent.click(await screen.findByRole("button", { name: "Request Backend" }));

    expect((await screen.findByRole("status")).textContent).toBe("Requested mona. Already requested: hubot.");
    expect(requestReview).toHaveBeenCalledTimes(1);
    expect(requestReview).toHaveBeenCalledWith(["mona", "hubot"]);
  });

  it("names the pull request it is working on", async () => {
    renderApp();

    expect(await screen.findByText("acme/widgets#7")).toBeTruthy();
  });

  it("explains why the reviewer list is missing and offers typing logins instead", async () => {
    renderApp({ candidates: { ok: false, error: "This page has no Reviewers picker." } });

    expect((await screen.findByRole("alert")).textContent).toBe("This page has no Reviewers picker.");
    expect(screen.getByRole("button", { name: "New group" })).toBeTruthy();
  });

  it("deletes a group", async () => {
    const { save } = renderApp({ groups: [backend] });

    fireEvent.click(await screen.findByRole("button", { name: "Delete Backend" }));

    expect(screen.queryByRole("listitem", { name: "Backend" })).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([]);
  });
});

describe("App away from a pull request", () => {
  it("does not ask the tab for reviewers and says where to go", async () => {
    const { listReviewers, requestReview } = renderApp({ groups: [backend], pullRequest: null });

    const request = await screen.findByRole("button", { name: "Request Backend" });

    expect(request.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Open a GitHub pull request to request review.")).toBeTruthy();
    fireEvent.click(request);
    expect(requestReview).not.toHaveBeenCalled();
    expect(listReviewers).not.toHaveBeenCalled();
  });

  it("lists each saved group with its members", async () => {
    renderApp({ groups: [backend], pullRequest: null });

    const card = await screen.findByRole("listitem", { name: "Backend" });

    expect(within(card).getByText("mona, hubot")).toBeTruthy();
  });

  it("saves a new group from a typed member list", async () => {
    const { save } = renderApp({ groups: [backend], pullRequest: null });
    fireEvent.click(await screen.findByRole("button", { name: "New group" }));

    fillGroupForm("Frontend", "@octocat,\nhubot");

    expect(await screen.findByRole("listitem", { name: "Frontend" })).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([
      backend,
      { id: "new-id", name: "Frontend", members: ["octocat", "hubot"] },
    ]);
  });

  it("names the typed entries that are not GitHub logins and saves nothing", async () => {
    const { save } = renderApp({ pullRequest: null });
    fireEvent.click(await screen.findByRole("button", { name: "New group" }));

    fillGroupForm("Frontend", "octocat not!valid");

    expect((await screen.findByRole("alert")).textContent).toBe("Not GitHub logins: not!valid");
    expect(save).not.toHaveBeenCalled();
  });

  it("asks for at least one typed member before saving", async () => {
    const { save } = renderApp({ pullRequest: null });
    fireEvent.click(await screen.findByRole("button", { name: "New group" }));

    fillGroupForm("Frontend", " ");

    expect((await screen.findByRole("alert")).textContent).toBe("Add at least one GitHub login.");
    expect(save).not.toHaveBeenCalled();
  });

  it("edits a group by typing", async () => {
    const { save } = renderApp({ groups: [backend], pullRequest: null });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Backend" }));

    fillGroupForm("Backend", "mona octocat");

    expect(await screen.findByText("mona, octocat")).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([{ id: "g1", name: "Backend", members: ["mona", "octocat"] }]);
  });

  it("shows why stored groups could not be read", async () => {
    const load = vi.fn<GroupStore["load"]>().mockRejectedValueOnce(new Error("groups[0].members: too small"));
    render(
      <App
        store={{ load, save: vi.fn() }}
        drafts={{ load: vi.fn().mockResolvedValueOnce(emptyDraft), save: vi.fn() }}
        requestReview={vi.fn()}
        listReviewers={vi.fn()}
        newId={() => "new-id"}
        pullRequest={null}
      />,
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Saved groups could not be read: groups[0].members: too small",
    );
  });
});
