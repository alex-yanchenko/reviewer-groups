import { describe, expect, it, vi } from "vitest";
import type { Group } from "../groups/group";
import type {
  LookUpGroupReply,
  RequestReviewReply,
  ReviewerCandidate,
  ReviewRequestOutcome,
} from "../messages";
import { askGroup, asksSome, describeAsk, type AskOutcome } from "./askGroup";

const person = (login: string, overrides: Partial<ReviewerCandidate> = {}): ReviewerCandidate => ({
  login,
  description: "",
  avatarUrl: null,
  team: false,
  requested: false,
  available: true,
  reviewState: null,
  ...overrides,
});

const outcome = (overrides: Partial<ReviewRequestOutcome>): ReviewRequestOutcome => ({
  added: [],
  alreadyRequested: [],
  unavailable: [],
  notFound: [],
  unconfirmed: [],
  dropped: [],
  gone: [],
  ...overrides,
});

const noProblems = outcome({});

const lookupOf = (
  candidates: (ReviewerCandidate | string)[],
  author: string | null = null,
): LookUpGroupReply => ({
  ok: true,
  author,
  members: candidates.map((entry) =>
    typeof entry === "string"
      ? { member: entry, candidate: null }
      : { member: entry.login, candidate: entry },
  ),
});

const addingEveryone = () =>
  vi
    .fn<(members: string[]) => Promise<RequestReviewReply>>()
    .mockImplementation((members) => Promise.resolve({ ok: true, outcome: outcome({ added: members }) }));

const runAsk = ({
  ask,
  candidates,
  author = null,
  counts = {},
  lastAsked = {},
  request = addingEveryone(),
}: {
  ask: number;
  candidates: (ReviewerCandidate | string)[];
  author?: string | null;
  counts?: Record<string, number | null>;
  lastAsked?: Record<string, number>;
  request?: ReturnType<typeof addingEveryone>;
}) => {
  const count = vi.fn((login: string) => Promise.resolve(counts[login] ?? null));
  const group: Group = {
    id: "g1",
    name: "Platform",
    members: candidates.map((entry) => (typeof entry === "string" ? entry : entry.login)),
    ask,
  };
  const reply = askGroup(group, {
    lookUp: () => Promise.resolve(lookupOf(candidates, author)),
    count,
    request,
    lastAsked,
  });
  return { reply, request, count };
};

describe("askGroup", () => {
  it("requests the members with the fewest open review requests", async () => {
    const { reply, request } = runAsk({
      ask: 2,
      candidates: [person("ada-dev"), person("grace-ops"), person("linus-qa"), person("joan-ux")],
      counts: { "ada-dev": 3, "grace-ops": 1, "linus-qa": 0, "joan-ux": 2 },
    });

    expect(await reply).toEqual({
      ok: true,
      ask: {
        wanted: 2,
        picked: [
          { login: "linus-qa", openRequests: 0 },
          { login: "grace-ops", openRequests: 1 },
        ],
        alreadyRequested: [],
        problems: noProblems,
      },
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(["linus-qa", "grace-ops"]);
  });

  it("puts people whose count is unknown after everyone whose count is known", async () => {
    const { reply } = runAsk({
      ask: 1,
      candidates: [person("ada-dev"), person("grace-ops")],
      counts: { "ada-dev": null, "grace-ops": 5 },
    });

    expect(await reply).toEqual({
      ok: true,
      ask: {
        wanted: 1,
        picked: [{ login: "grace-ops", openRequests: 5 }],
        alreadyRequested: [],
        problems: noProblems,
      },
    });
  });

  it("breaks a tie with whoever was asked least recently, people never asked first", async () => {
    const run = runAsk({
      ask: 2,
      candidates: [person("ada-dev"), person("grace-ops"), person("linus-qa")],
      counts: { "ada-dev": 1, "grace-ops": 1, "linus-qa": 1 },
      lastAsked: { "ada-dev": 500, "grace-ops": 100 },
    });
    await run.reply;

    expect(run.request).toHaveBeenCalledWith(["linus-qa", "grace-ops"]);
  });

  it("counts members already requested toward the number asked", async () => {
    const run = runAsk({
      ask: 2,
      candidates: [person("ada-dev"), person("grace-ops", { requested: true }), person("linus-qa")],
      counts: { "ada-dev": 1, "linus-qa": 4 },
    });

    expect(await run.reply).toEqual({
      ok: true,
      ask: {
        wanted: 2,
        picked: [{ login: "ada-dev", openRequests: 1 }],
        alreadyRequested: ["grace-ops"],
        problems: noProblems,
      },
    });
    expect(run.request).toHaveBeenCalledWith(["ada-dev"]);
  });

  it("requests nobody when enough members are already requested", async () => {
    const run = runAsk({ ask: 1, candidates: [person("ada-dev", { requested: true }), person("grace-ops")] });

    expect(await run.reply).toEqual({
      ok: true,
      ask: { wanted: 1, picked: [], alreadyRequested: ["ada-dev"], problems: noProblems },
    });
    expect(run.request).not.toHaveBeenCalled();
    expect(run.count).not.toHaveBeenCalled();
  });

  it("leaves out the author, people GitHub will not take and anyone who already reviewed", async () => {
    const run = runAsk({
      ask: 3,
      author: "Ada-Dev",
      candidates: [
        person("ada-dev"),
        person("grace-ops", { available: false }),
        person("linus-qa", { reviewState: "approved" }),
        person("joan-ux"),
        "stranger",
      ],
    });

    expect(await run.reply).toEqual({
      ok: true,
      ask: {
        wanted: 3,
        picked: [{ login: "joan-ux", openRequests: null }],
        alreadyRequested: [],
        problems: outcome({ unavailable: ["grace-ops"], notFound: ["stranger"] }),
      },
    });
    expect(run.count).toHaveBeenCalledTimes(1);
  });

  it("asks the next candidates when GitHub does not confirm a pick", async () => {
    const request = vi
      .fn<(members: string[]) => Promise<RequestReviewReply>>()
      .mockResolvedValueOnce({
        ok: true,
        outcome: outcome({ added: ["linus-qa"], unconfirmed: ["grace-ops"] }),
      })
      .mockResolvedValueOnce({ ok: true, outcome: outcome({ added: ["ada-dev"] }) });
    const run = runAsk({
      ask: 2,
      candidates: [person("ada-dev"), person("grace-ops"), person("linus-qa")],
      counts: { "ada-dev": 2, "grace-ops": 1, "linus-qa": 0 },
      request,
    });

    expect(await run.reply).toEqual({
      ok: true,
      ask: {
        wanted: 2,
        picked: [
          { login: "linus-qa", openRequests: 0 },
          { login: "ada-dev", openRequests: 2 },
        ],
        alreadyRequested: [],
        problems: outcome({ unconfirmed: ["grace-ops"] }),
      },
    });
    expect(request.mock.calls).toEqual([[["linus-qa", "grace-ops"]], [["ada-dev"]]]);
  });

  it("passes on a failed request with whoever was already added", async () => {
    const request = vi
      .fn<(members: string[]) => Promise<RequestReviewReply>>()
      .mockResolvedValueOnce({
        ok: true,
        outcome: outcome({ added: ["linus-qa"], unconfirmed: ["grace-ops"] }),
      })
      .mockResolvedValueOnce({ ok: false, error: "GitHub answered 422." });
    const run = runAsk({
      ask: 2,
      candidates: [person("ada-dev"), person("grace-ops"), person("linus-qa")],
      counts: { "ada-dev": 2, "grace-ops": 1, "linus-qa": 0 },
      request,
    });

    expect(await run.reply).toEqual({ ok: false, error: "GitHub answered 422.", added: ["linus-qa"] });
  });

  it("passes on a look-up the page could not do", async () => {
    const group: Group = { id: "g1", name: "Platform", members: ["ada-dev", "grace-ops"], ask: 1 };

    const reply = await askGroup(group, {
      lookUp: () => Promise.resolve({ ok: false, error: "This tab is not a GitHub pull request." }),
      count: () => Promise.resolve(null),
      request: addingEveryone(),
      lastAsked: {},
    });

    expect(reply).toEqual({ ok: false, error: "This tab is not a GitHub pull request.", added: [] });
  });
});

describe("asksSome", () => {
  it("is true for an ask below the member count", () => {
    expect(asksSome({ id: "g1", name: "Platform", members: ["ada-dev", "grace-ops"], ask: 1 })).toBe(true);
  });

  it("treats an ask at or above the member count, or none, as asking everyone", () => {
    expect(asksSome({ id: "g1", name: "Platform", members: ["ada-dev", "grace-ops"], ask: 2 })).toBe(false);
    expect(asksSome({ id: "g1", name: "Platform", members: ["ada-dev"] })).toBe(false);
  });
});

describe("describeAsk", () => {
  it("names who was picked with their counts, who was already requested, and the shortfall", () => {
    const ask: AskOutcome = {
      wanted: 4,
      picked: [
        { login: "linus-qa", openRequests: 0 },
        { login: "grace-ops", openRequests: null },
      ],
      alreadyRequested: ["joan-ux"],
      problems: outcome({ unavailable: ["ada-dev"] }),
    };

    expect(describeAsk("Platform", ask)).toBe(
      "Picked linus-qa (0 open), grace-ops (count unknown) from Platform. Already requested: joan-ux. Not available to review: ada-dev. Only 3 of 4 could be asked.",
    );
  });

  it("says plainly when nobody new was needed", () => {
    expect(
      describeAsk("Platform", { wanted: 1, picked: [], alreadyRequested: ["joan-ux"], problems: noProblems }),
    ).toBe("Nobody new to request from Platform. Already requested: joan-ux.");
  });
});
