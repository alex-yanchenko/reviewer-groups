import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Group } from "../groups/group";
import { fillGroupForm, renderApp } from "./testing/renderApp";

afterEach(cleanup);

const platform: Group = { id: "g1", name: "Platform", members: ["ada-dev", "grace-ops"] };
const widgets: Group = { id: "g2", name: "Widgets", members: ["linus-qa"], repos: ["ACME/*"] };
const docsSite: Group = { id: "g3", name: "Docs site", members: ["joan-ux"], repos: ["northwind/docs"] };

const cardNames = async () =>
  within(await screen.findByRole("list", { name: "Groups" }))
    .getAllByRole("listitem")
    .map((card) => card.getAttribute("aria-label"));

describe("App groups linked to repositories", () => {
  it("lists the groups linked to this pull request's repository first, marked as such", async () => {
    renderApp({ groups: [platform, widgets, docsSite] });

    expect(await cardNames()).toEqual(["Widgets", "Platform", "Docs site"]);
    expect(
      within(screen.getByRole("listitem", { name: "Widgets" })).getByText("This repository"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("listitem", { name: "Platform" })).queryByText("This repository"),
    ).toBeNull();
  });

  it("keeps the saved order away from a pull request", async () => {
    renderApp({ groups: [platform, widgets, docsSite], pullRequest: null });

    expect(await cardNames()).toEqual(["Platform", "Widgets", "Docs site"]);
    expect(screen.queryByText("This repository")).toBeNull();
  });

  it("links a group to repositories while editing its members", async () => {
    const { save } = renderApp({ groups: [platform] });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Platform" }));

    fireEvent.change(await screen.findByLabelText("Repositories"), {
      target: { value: "acme/widgets, acme-labs/*" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(save).toHaveBeenCalledWith([{ ...platform, repos: ["acme/widgets", "acme-labs/*"] }]);
  });

  it("refuses a pattern that is not owner/repo or owner/*", async () => {
    const { save } = renderApp({ groups: [platform] });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Platform" }));

    fireEvent.change(await screen.findByLabelText("Repositories"), { target: { value: "*/widgets" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Not owner/repo or owner/* patterns: */widgets",
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("unlinks a group whose repositories are cleared", async () => {
    const { save } = renderApp({ groups: [widgets], pullRequest: null });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Widgets" }));

    expect(screen.getByLabelText<HTMLInputElement>("Repositories").value).toBe("ACME/*");
    fireEvent.change(screen.getByLabelText("Repositories"), { target: { value: "" } });
    fillGroupForm("Widgets", "linus-qa");

    expect(save).toHaveBeenCalledWith([{ id: "g2", name: "Widgets", members: ["linus-qa"] }]);
  });

  it("saves the repositories typed for a new group", async () => {
    const { save } = renderApp({ pullRequest: null });
    fireEvent.click(await screen.findByRole("button", { name: "New group" }));

    fireEvent.change(screen.getByLabelText("Repositories"), { target: { value: "northwind/docs" } });
    fillGroupForm("Docs site", "joan-ux");

    expect(save).toHaveBeenCalledWith([
      { id: "new-id", name: "Docs site", members: ["joan-ux"], repos: ["northwind/docs"] },
    ]);
  });
});
