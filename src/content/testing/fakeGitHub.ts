import { vi } from "vitest";

export interface FakePerson {
  id: number;
  login: string;
  team?: boolean;
  name?: string;
  avatar?: string;
  selected?: boolean;
  disabled?: boolean;
  suggested?: boolean;
}

export interface FakeGitHubOptions {
  postStatus?: number;
  postIgnored?: boolean;
  searchAnswer?: unknown;
  missingAccounts?: string[];
  profileStatus?: number;
}

export interface FakeGitHub {
  fetch: ReturnType<typeof vi.fn<typeof fetch>>;
  posts: URLSearchParams[];
  profileChecks: string[];
  requestedLogins: () => string[];
}

export const PULL_REQUEST_PATH = "/acme/widgets/pull/7";

const REVIEWER_FIELDS = ["reviewer_user_ids[]", "reviewer_team_ids[]"];

const hiddenInput = (doc: Document, name: string, value: string) => {
  const input = doc.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  return input;
};

export const mountPullRequestPage = (
  doc: Document,
  { tab = "", withForm = true, staleReviewerIds = [] as number[] } = {},
) => {
  window.history.replaceState({}, "", `${PULL_REQUEST_PATH}${tab}`);
  if (!withForm) return;
  const sidebarItem = doc.createElement("div");
  sidebarItem.className = "discussion-sidebar-item js-discussion-sidebar-item";
  const form = doc.createElement("form");
  form.action = `${PULL_REQUEST_PATH}/review-requests`;
  form.method = "post";
  form.append(
    hiddenInput(doc, "authenticity_token", "page-token"),
    hiddenInput(doc, "partial_last_updated", "1700000000"),
    ...staleReviewerIds.map((id) => hiddenInput(doc, "reviewer_user_ids[]", String(id))),
    hiddenInput(doc, "dummy-field-just-to-avoid-empty-submit", "foo"),
    hiddenInput(doc, "review_effort_level", "medium"),
  );
  const marker = doc.createElement("span");
  marker.className = "page-sidebar";
  sidebarItem.append(form, marker);
  doc.body.append(sidebarItem);
};

const entryFor = (person: FakePerson) => ({
  id: person.id,
  type: person.team ? "team" : "user",
  login: person.login,
  name: person.name ?? "",
  avatar: person.avatar ?? `https://avatars.githubusercontent.com/u/${person.id}`,
  selected: person.selected ?? false,
  disabled: person.disabled ?? false,
});

const matchesQuery = (person: FakePerson, query: string) =>
  query === ""
    ? (person.suggested ?? true)
    : person.login.toLowerCase().includes(query.toLowerCase()) ||
      (person.name ?? "").toLowerCase().includes(query.toLowerCase());

const freshSidebar = (logins: string[]) =>
  `<div class="discussion-sidebar-item js-discussion-sidebar-item"><form action="${PULL_REQUEST_PATH}/review-requests" method="post"></form><span class="fresh-sidebar">${logins.join(",")}</span></div>`;

export const createFakeGitHub = (people: FakePerson[], options: FakeGitHubOptions = {}): FakeGitHub => {
  const posts: URLSearchParams[] = [];
  const requestedLogins = () => people.filter((person) => person.selected).map((person) => person.login);

  const answerSearch = (url: URL) => {
    if (options.searchAnswer !== undefined) return Response.json(options.searchAnswer);
    const query = url.searchParams.get("q") ?? "";
    const found = people.filter((person) => person.selected || matchesQuery(person, query));
    return Response.json({ suggestions: [], users: found.map(entryFor) });
  };

  const answerPost = (body: URLSearchParams) => {
    posts.push(body);
    if (options.postStatus !== undefined) return new Response("", { status: options.postStatus });
    if (!options.postIgnored) {
      const ids = new Set(REVIEWER_FIELDS.flatMap((field) => body.getAll(field)));
      for (const person of people) person.selected = ids.has(String(person.id));
    }
    return new Response(freshSidebar(requestedLogins()), { headers: { "content-type": "text/html" } });
  };

  const profileChecks: string[] = [];
  const missing = new Set((options.missingAccounts ?? []).map((login) => login.toLowerCase()));
  const answerProfile = (url: URL) => {
    profileChecks.push(url.pathname);
    if (options.profileStatus !== undefined) return new Response(null, { status: options.profileStatus });
    const login = decodeURIComponent(url.pathname)
      .replace(/^\/orgs\/([^/]+)\/teams\/([^/]+)$/, "$1/$2")
      .replace(/^\/apps\/([^/]+)$/, "$1[bot]")
      .replace(/^\//, "");
    return new Response(null, { status: missing.has(login.toLowerCase()) ? 404 : 200 });
  };

  const fakeFetch = vi.fn<typeof fetch>((input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, window.location.origin);
    if (init?.method === "POST") {
      const body = init.body instanceof URLSearchParams ? init.body : new URLSearchParams();
      return Promise.resolve(answerPost(body));
    }
    if (init?.method === "HEAD") return Promise.resolve(answerProfile(url));
    return Promise.resolve(answerSearch(url));
  });

  return { fetch: fakeFetch, posts, profileChecks, requestedLogins };
};
