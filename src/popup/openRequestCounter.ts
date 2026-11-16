import { matchQuery, type Query, type QueryCacheNotifyEvent, type QueryClient } from "@tanstack/react-query";
import PQueue from "p-queue";
import * as z from "zod/mini";
import { isPersonLogin } from "../groups/group";
import type { StorageArea } from "../groups/storage";
import type { CountOpenRequestsReply } from "../messages";

export const OPEN_REQUEST_COUNTS_KEY = "openRequestCounts";

const COUNT_LIFETIME_MS = 10 * 60 * 1000;
const LIMITED_PROBLEM = "GitHub is limiting searches; counts paused.";
const UNAVAILABLE_PROBLEM = "Counts unavailable.";
const OPEN_REQUEST_COUNT = "open-request-count";
const URGENT = 1;

export type CountCacheArea = Pick<StorageArea, "get" | "set">;

const cachedCountSchema = z.object({ count: z.int().check(z.nonnegative()), at: z.number() });
const storedCountsSchema = z.record(z.string(), z.unknown());

type CachedCount = z.infer<typeof cachedCountSchema>;

export interface CountSnapshot {
  counts: Record<string, number>;
  problem: string;
}

class CountNotReadError extends Error {
  override readonly name = "CountNotReadError";
}

const countKey = (login: string) => [OPEN_REQUEST_COUNT, login.toLowerCase()];

const readStoredCounts = (raw: unknown): [string, CachedCount][] => {
  const stored = storedCountsSchema.safeParse(raw);
  if (!stored.success) return [];
  return Object.entries(stored.data).flatMap(([login, entry]) => {
    const cached = cachedCountSchema.safeParse(entry);
    return cached.success ? [[login.toLowerCase(), cached.data]] : [];
  });
};

const isCountOutcome = (event: QueryCacheNotifyEvent): boolean =>
  event.type === "updated" &&
  (event.action.type === "success" || event.action.type === "error") &&
  matchQuery({ queryKey: [OPEN_REQUEST_COUNT] }, event.query);

const freshCount = (query: Query): [string, CachedCount][] => {
  const [, login] = query.queryKey;
  const count = query.state.data;
  return typeof login === "string" && typeof count === "number" && !query.isStaleByTime(COUNT_LIFETIME_MS)
    ? [[login, { count, at: query.state.dataUpdatedAt }]]
    : [];
};

export class OpenRequestCounter {
  private readonly countInTab: (login: string) => Promise<CountOpenRequestsReply>;
  private readonly area: CountCacheArea;
  private readonly queryClient: QueryClient;
  private readonly queue = new PQueue({ concurrency: 1, autoStart: false });
  private readonly listeners = new Set<() => void>();
  private limited = false;
  private failed = false;
  private current: CountSnapshot = { counts: {}, problem: "" };

  constructor({
    countInTab,
    area,
    queryClient,
  }: {
    countInTab: (login: string) => Promise<CountOpenRequestsReply>;
    area: CountCacheArea;
    queryClient: QueryClient;
  }) {
    this.countInTab = countInTab;
    this.area = area;
    this.queryClient = queryClient;
    void area
      .get(OPEN_REQUEST_COUNTS_KEY)
      .then(
        (stored) => this.restore(readStoredCounts(stored[OPEN_REQUEST_COUNTS_KEY])),
        () => undefined,
      )
      .finally(() => {
        queryClient.getQueryCache().subscribe((event) => {
          if (!isCountOutcome(event)) return;
          this.persist();
          this.announce();
        });
        this.announce();
        this.queue.start();
      });
  }

  count(login: string, { urgent = false }: { urgent?: boolean } = {}): Promise<number | null> {
    if (!isPersonLogin(login)) return Promise.resolve(null);
    return this.queue
      .add(
        () =>
          this.queryClient.fetchQuery({
            queryKey: countKey(login),
            queryFn: () => this.countNow(login),
            staleTime: COUNT_LIFETIME_MS,
          }),
        { priority: urgent ? URGENT : 0 },
      )
      .catch(() => null);
  }

  bump(logins: readonly string[]): void {
    this.shift(logins, 1);
  }

  unbump(logins: readonly string[]): void {
    this.shift(logins, -1);
  }

  snapshot = (): CountSnapshot => this.current;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private restore(stored: [string, CachedCount][]): void {
    for (const [login, { count, at }] of stored) {
      this.queryClient.setQueryData(countKey(login), count, { updatedAt: at });
    }
  }

  private shift(logins: readonly string[], by: number): void {
    for (const login of logins) {
      const query = this.queryClient.getQueryCache().find({ queryKey: countKey(login), exact: true });
      for (const [, { count, at }] of query === undefined ? [] : freshCount(query)) {
        this.queryClient.setQueryData(countKey(login), Math.max(0, count + by), { updatedAt: at });
      }
    }
  }

  private async countNow(login: string): Promise<number> {
    if (this.limited) throw new CountNotReadError(LIMITED_PROBLEM);
    const reply = await this.countInTab(login);
    if (reply.ok) {
      this.failed = false;
      return reply.count;
    }
    if (reply.limited) this.limited = true;
    else this.failed = true;
    throw new CountNotReadError(reply.error);
  }

  private freshCounts(): [string, CachedCount][] {
    return this.queryClient
      .getQueryCache()
      .findAll({ queryKey: [OPEN_REQUEST_COUNT] })
      .flatMap(freshCount);
  }

  private persist(): void {
    const fresh = Object.fromEntries(this.freshCounts());
    void this.area.set({ [OPEN_REQUEST_COUNTS_KEY]: fresh }).catch(() => undefined);
  }

  private announce(): void {
    const counts = Object.fromEntries(this.freshCounts().map(([login, { count }]) => [login, count]));
    const problem = this.limited ? LIMITED_PROBLEM : this.failed ? UNAVAILABLE_PROBLEM : "";
    this.current = { counts, problem };
    for (const listener of this.listeners) listener();
  }
}
