import { afterEach, describe, expect, it, vi } from "vitest";
import type { CountOpenRequestsReply } from "../messages";
import { OPEN_REQUEST_COUNTS_KEY, OpenRequestCounter, type CountCacheArea } from "./openRequestCounter";
import { createPopupQueryClient } from "./queryClient";

const TEN_MINUTES = 10 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
});

const buildArea = (stored: Record<string, unknown> = {}) => {
  const get = vi.fn<CountCacheArea["get"]>().mockResolvedValue(stored);
  const set = vi.fn<CountCacheArea["set"]>().mockResolvedValue(undefined);
  return { area: { get, set } satisfies CountCacheArea, set };
};

const counting = (counts: Record<string, number>) =>
  vi
    .fn<(login: string) => Promise<CountOpenRequestsReply>>()
    .mockImplementation((login) => Promise.resolve({ ok: true, count: counts[login] ?? 0 }));

const buildCounter = (
  countInTab: (login: string) => Promise<CountOpenRequestsReply>,
  {
    stored = {},
    clock = { now: 1_000_000 },
  }: { stored?: Record<string, unknown>; clock?: { now: number } } = {},
) => {
  const { area, set } = buildArea(stored);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock.now);
  const counter = new OpenRequestCounter({ countInTab, area, queryClient: createPopupQueryClient() });
  const tickBy = (milliseconds: number) => {
    clock.now += milliseconds;
    vi.setSystemTime(clock.now);
  };
  return { counter, set, tickBy };
};

describe("OpenRequestCounter", () => {
  it("asks the page for a count once and reuses it for ten minutes", async () => {
    const countInTab = counting({ "ada-dev": 2 });
    const { counter, tickBy } = buildCounter(countInTab);

    expect(await counter.count("ada-dev")).toBe(2);
    tickBy(TEN_MINUTES - 1);
    expect(await counter.count("Ada-Dev")).toBe(2);
    tickBy(1);
    expect(await counter.count("ada-dev")).toBe(2);

    expect(countInTab).toHaveBeenCalledTimes(2);
  });

  it("keeps counts in session storage so the next popup reuses them", async () => {
    const countInTab = counting({ "ada-dev": 2 });
    const { counter, set } = buildCounter(countInTab);

    await counter.count("ada-dev");

    expect(set).toHaveBeenLastCalledWith({
      [OPEN_REQUEST_COUNTS_KEY]: { "ada-dev": { count: 2, at: 1_000_000 } },
    });
  });

  it("uses a fresh count an earlier popup stored and ignores an unreadable one", async () => {
    const countInTab = counting({ "grace-ops": 5 });
    const { counter } = buildCounter(countInTab, {
      stored: {
        [OPEN_REQUEST_COUNTS_KEY]: {
          "ada-dev": { count: 1, at: 999_000 },
          "grace-ops": { count: "many", at: 0 },
        },
      },
    });

    expect(await counter.count("ada-dev")).toBe(1);
    expect(await counter.count("grace-ops")).toBe(5);
    expect(countInTab).toHaveBeenCalledTimes(1);
    expect(countInTab).toHaveBeenCalledWith("grace-ops");
  });

  it("asks the page about one person at a time", async () => {
    let running = 0;
    let mostAtOnce = 0;
    const countInTab = vi.fn(async (): Promise<CountOpenRequestsReply> => {
      running += 1;
      mostAtOnce = Math.max(mostAtOnce, running);
      await Promise.resolve();
      running -= 1;
      return { ok: true, count: 1 };
    });
    const { counter } = buildCounter(countInTab);

    await Promise.all(["ada-dev", "grace-ops", "linus-qa"].map((login) => counter.count(login)));

    expect(mostAtOnce).toBe(1);
    expect(countInTab).toHaveBeenCalledTimes(3);
  });

  it("puts counts for a group being asked ahead of the picker's", async () => {
    const countInTab = counting({});
    const { counter } = buildCounter(countInTab);

    const shown = ["ada-dev", "grace-ops", "linus-qa"].map((login) => counter.count(login));
    const asked = counter.count("joan-ux", { urgent: true });
    await Promise.all([...shown, asked]);

    expect(countInTab.mock.calls.map(([login]) => login)).toEqual([
      "joan-ux",
      "ada-dev",
      "grace-ops",
      "linus-qa",
    ]);
  });

  it("stops asking for the rest of the popup once GitHub limits searches", async () => {
    const countInTab = vi.fn<(login: string) => Promise<CountOpenRequestsReply>>().mockResolvedValueOnce({
      ok: false,
      error: "GitHub is limiting searches; counts paused.",
      limited: true,
    });
    const { counter } = buildCounter(countInTab);

    expect(await counter.count("ada-dev")).toBeNull();
    expect(await counter.count("grace-ops")).toBeNull();

    expect(countInTab).toHaveBeenCalledTimes(1);
    expect(counter.snapshot()).toEqual({
      counts: {},
      problem: "GitHub is limiting searches; counts paused.",
    });
  });

  it("says counts are unavailable when the page could not read one, and keeps the counts it has", async () => {
    const countInTab = vi
      .fn<(login: string) => Promise<CountOpenRequestsReply>>()
      .mockResolvedValueOnce({ ok: true, count: 3 })
      .mockResolvedValueOnce({ ok: false, error: "Counts unavailable.", limited: false });
    const { counter } = buildCounter(countInTab);

    await counter.count("ada-dev");
    expect(await counter.count("grace-ops")).toBeNull();

    expect(counter.snapshot()).toEqual({ counts: { "ada-dev": 3 }, problem: "Counts unavailable." });
  });

  it("stops saying counts are unavailable once a later count succeeds", async () => {
    const countInTab = vi
      .fn<(login: string) => Promise<CountOpenRequestsReply>>()
      .mockResolvedValueOnce({ ok: false, error: "Counts unavailable.", limited: false })
      .mockResolvedValueOnce({ ok: true, count: 3 });
    const { counter } = buildCounter(countInTab);

    await counter.count("ada-dev");
    expect(counter.snapshot().problem).toBe("Counts unavailable.");
    await counter.count("grace-ops");

    expect(counter.snapshot()).toEqual({ counts: { "grace-ops": 3 }, problem: "" });
  });

  it("saves only the counts that have not expired", async () => {
    const countInTab = counting({ "ada-dev": 2 });
    const { counter, set } = buildCounter(countInTab, {
      stored: {
        [OPEN_REQUEST_COUNTS_KEY]: {
          "grace-ops": { count: 1, at: 1_000_000 - TEN_MINUTES },
          "linus-qa": { count: 4, at: 999_000 },
        },
      },
    });

    await counter.count("ada-dev");

    expect(set).toHaveBeenLastCalledWith({
      [OPEN_REQUEST_COUNTS_KEY]: {
        "linus-qa": { count: 4, at: 999_000 },
        "ada-dev": { count: 2, at: 1_000_000 },
      },
    });
  });

  it("never asks about a team or a bot, whose requests the search does not show", async () => {
    const countInTab = counting({});
    const { counter } = buildCounter(countInTab);

    expect(await counter.count("acme/backend")).toBeNull();
    expect(await counter.count("helper-app[bot]")).toBeNull();
    expect(countInTab).not.toHaveBeenCalled();
  });

  it("raises a known count by one once that person is requested", async () => {
    const countInTab = counting({ "ada-dev": 2 });
    const { counter } = buildCounter(countInTab);
    await counter.count("ada-dev");

    counter.bump(["ada-dev", "grace-ops"]);

    expect(counter.snapshot()).toEqual({ counts: { "ada-dev": 3 }, problem: "" });
    expect(await counter.count("ada-dev")).toBe(3);
    expect(countInTab).toHaveBeenCalledTimes(1);
  });

  it("takes a bumped count back down by one once that person is no longer requested, never below zero", async () => {
    const { counter } = buildCounter(counting({ "ada-dev": 2, "grace-ops": 0 }));
    await counter.count("ada-dev");
    await counter.count("grace-ops");
    counter.bump(["ada-dev"]);

    counter.unbump(["Ada-Dev", "grace-ops", "linus-qa"]);

    expect(counter.snapshot()).toEqual({ counts: { "ada-dev": 2, "grace-ops": 0 }, problem: "" });
  });

  it("tells subscribers when a count arrives", async () => {
    const { counter } = buildCounter(counting({ "ada-dev": 2 }));
    const listener = vi.fn();
    counter.subscribe(listener);

    await counter.count("ada-dev");

    expect(listener).toHaveBeenCalled();
  });
});
