import * as z from "zod/mini";
import { isPersonLogin } from "../groups/group";
import type { StorageArea } from "../groups/storage";
import type { CountOpenRequestsReply } from "../messages";

export const OPEN_REQUEST_COUNTS_KEY = "openRequestCounts";

const COUNT_LIFETIME_MS = 10 * 60 * 1000;
const LIMITED_PROBLEM = "GitHub is limiting searches; counts paused.";
const UNAVAILABLE_PROBLEM = "Counts unavailable.";

export type CountCacheArea = Pick<StorageArea, "get" | "set">;

const cachedCountSchema = z.object({ count: z.int().check(z.nonnegative()), at: z.number() });
const storedCountsSchema = z.record(z.string(), z.unknown());

type CachedCount = z.infer<typeof cachedCountSchema>;

export interface CountSnapshot {
  counts: Record<string, number>;
  problem: string;
}

interface CountJob {
  login: string;
  urgent: boolean;
  resolve: (count: number | null) => void;
}

const readStoredCounts = (raw: unknown): Record<string, CachedCount> => {
  const stored = storedCountsSchema.safeParse(raw);
  if (!stored.success) return {};
  return Object.fromEntries(
    Object.entries(stored.data).flatMap(([login, entry]) => {
      const cached = cachedCountSchema.safeParse(entry);
      return cached.success ? [[login.toLowerCase(), cached.data]] : [];
    }),
  );
};

export class OpenRequestCounter {
  private readonly countInTab: (login: string) => Promise<CountOpenRequestsReply>;
  private readonly area: CountCacheArea;
  private readonly now: () => number;
  private readonly loaded: Promise<void>;
  private readonly queue: CountJob[] = [];
  private readonly listeners = new Set<() => void>();
  private cache: Record<string, CachedCount> = {};
  private working = false;
  private limited = false;
  private failed = false;
  private current: CountSnapshot = { counts: {}, problem: "" };

  constructor({
    countInTab,
    area,
    now = Date.now,
  }: {
    countInTab: (login: string) => Promise<CountOpenRequestsReply>;
    area: CountCacheArea;
    now?: () => number;
  }) {
    this.countInTab = countInTab;
    this.area = area;
    this.now = now;
    this.loaded = area.get(OPEN_REQUEST_COUNTS_KEY).then(
      (stored) => {
        this.cache = readStoredCounts(stored[OPEN_REQUEST_COUNTS_KEY]);
        this.announce();
      },
      () => undefined,
    );
  }

  count(login: string, { urgent = false }: { urgent?: boolean } = {}): Promise<number | null> {
    if (!isPersonLogin(login)) return Promise.resolve(null);
    return new Promise((resolve) => {
      const job = { login, urgent, resolve };
      const firstOrdinary = this.queue.findIndex((queued) => !queued.urgent);
      if (urgent && firstOrdinary >= 0) this.queue.splice(firstOrdinary, 0, job);
      else this.queue.push(job);
      void this.work();
    });
  }

  bump(logins: readonly string[]): void {
    for (const login of logins) {
      const cached = this.freshCount(login.toLowerCase());
      if (cached !== undefined) this.cache[login.toLowerCase()] = { ...cached, count: cached.count + 1 };
    }
    this.persist();
    this.announce();
  }

  snapshot = (): CountSnapshot => this.current;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private async work(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      await this.loaded;
      for (let job = this.queue.shift(); job !== undefined; job = this.queue.shift()) {
        job.resolve(await this.countNow(job.login));
      }
    } finally {
      this.working = false;
    }
  }

  private freshCount(key: string): CachedCount | undefined {
    const cached = this.cache[key];
    return cached !== undefined && this.now() - cached.at < COUNT_LIFETIME_MS ? cached : undefined;
  }

  private async countNow(login: string): Promise<number | null> {
    const key = login.toLowerCase();
    const cached = this.freshCount(key);
    if (cached !== undefined) return cached.count;
    if (this.limited) return null;
    const reply = await this.countInTab(login);
    if (reply.ok) {
      this.cache[key] = { count: reply.count, at: this.now() };
      this.persist();
    } else if (reply.limited) {
      this.limited = true;
    } else {
      this.failed = true;
    }
    this.announce();
    return reply.ok ? reply.count : null;
  }

  private persist(): void {
    void this.area.set({ [OPEN_REQUEST_COUNTS_KEY]: this.cache }).catch(() => undefined);
  }

  private announce(): void {
    const counts = Object.fromEntries(
      Object.keys(this.cache).flatMap((key) => {
        const cached = this.freshCount(key);
        return cached === undefined ? [] : [[key, cached.count]];
      }),
    );
    const problem = this.limited ? LIMITED_PROBLEM : this.failed ? UNAVAILABLE_PROBLEM : "";
    this.current = { counts, problem };
    for (const listener of this.listeners) listener();
  }
}
