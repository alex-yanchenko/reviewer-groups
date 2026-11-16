import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CountOpenRequestsReply } from "../messages";
import { candidate, renderApp } from "./testing/renderApp";

afterEach(cleanup);

const shown = {
  ok: true as const,
  candidates: [
    candidate("ada-dev"),
    candidate("grace-ops", { requested: true }),
    candidate("acme/web", { team: true }),
    candidate("helper-app[bot]"),
  ],
  reviewed: [],
};

const countBadge = async (login: string) =>
  within(await screen.findByRole("listitem", { name: login })).queryByTitle(/open requests you can see/);

describe("App open review request counts", () => {
  it("shows how many open review requests each person on the pull request has", async () => {
    renderApp({ candidates: shown, openRequestCounts: { "ada-dev": 2, "grace-ops": 0 } });

    await vi.waitFor(async () => expect((await countBadge("ada-dev"))?.textContent).toBe("2 open"));
    expect((await countBadge("ada-dev"))?.getAttribute("title")).toBe("2 open requests you can see");
    expect((await countBadge("grace-ops"))?.textContent).toBe("0 open");
    expect(await countBadge("acme/web")).toBeNull();
    expect(await countBadge("helper-app[bot]")).toBeNull();
  });

  it("asks about at most ten of the people shown", async () => {
    const many = Array.from({ length: 12 }, (_, index) => candidate(`dev-${index}`));
    const { countInTab } = renderApp({ candidates: { ok: true, candidates: many, reviewed: [] } });

    await vi.waitFor(() => expect(countInTab).toHaveBeenCalledTimes(10));
    expect(countInTab.mock.calls.map(([login]) => login)).toEqual(
      many.slice(0, 10).map(({ login }) => login),
    );
  });

  it("does not count the people a search finds", async () => {
    const { countInTab } = renderApp({ candidates: shown, searches: { lin: [candidate("linus-qa")] } });
    await vi.waitFor(() => expect(countInTab).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "lin" } });

    await screen.findByRole("checkbox", { name: "linus-qa" });
    expect(countInTab).toHaveBeenCalledTimes(2);
  });

  it("says counts are paused once GitHub limits searches", async () => {
    const countReply = vi
      .fn<(login: string) => Promise<CountOpenRequestsReply>>()
      .mockResolvedValue({ ok: false, error: "GitHub is limiting searches; counts paused.", limited: true });
    renderApp({ candidates: shown, countReply });

    expect(await screen.findByText("GitHub is limiting searches; counts paused.")).toBeTruthy();
    expect(countReply).toHaveBeenCalledTimes(1);
  });
});
