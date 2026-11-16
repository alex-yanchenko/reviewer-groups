import { vi } from "vitest";
import { ConversationCache, type GitHubPage } from "../githubPage";

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

export interface FakeConversationPage {
  status?: number;
  signedIn?: boolean;
  canRequest?: boolean;
  unreadable?: boolean;
  redirectedToLogin?: boolean;
  reviewerRows?: ReviewerRow[];
  formAction?: string;
}

export interface FakeGitHubOptions {
  postStatus?: number;
  postIgnored?: boolean;
  searchAnswer?: unknown;
  missingAccounts?: string[];
  profileStatus?: number;
  conversation?: FakeConversationPage;
  openRequestCounts?: Record<string, number>;
  searchStatus?: number;
  searchBody?: string;
}

export interface FakeGitHub {
  fetch: ReturnType<typeof vi.fn<typeof fetch>>;
  page: GitHubPage;
  posts: URLSearchParams[];
  profileChecks: string[];
  conversationFetches: () => number;
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

export interface ReviewerRow {
  login: string;
  tooltips: string[];
  menuIcons?: number;
}

const buildReviewerRow = (doc: Document, { login, tooltips, menuIcons = 0 }: ReviewerRow) => {
  const row = doc.createElement("div");
  row.className = "d-flex flex-items-center mb-2";
  const link = doc.createElement("a");
  link.href = `/${login}`;
  link.textContent = login;
  row.append(link);
  for (let index = 0; index < menuIcons; index += 1) {
    const icon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "octicon octicon-check");
    row.append(icon);
  }
  for (const text of tooltips) {
    const tooltip = doc.createElement("tool-tip");
    tooltip.textContent = text;
    row.append(tooltip);
  }
  return row;
};

const buildSidebar = (
  doc: Document,
  {
    token,
    staleReviewerIds = [],
    reviewerRows = [],
    formAction = `${PULL_REQUEST_PATH}/review-requests`,
  }: {
    token: string;
    staleReviewerIds?: number[];
    reviewerRows?: ReviewerRow[];
    formAction?: string;
  },
) => {
  const sidebarItem = doc.createElement("div");
  sidebarItem.className = "discussion-sidebar-item js-discussion-sidebar-item";
  const form = doc.createElement("form");
  form.setAttribute("action", formAction);
  form.method = "post";
  form.append(
    hiddenInput(doc, "authenticity_token", token),
    hiddenInput(doc, "partial_last_updated", "1700000000"),
    ...staleReviewerIds.map((id) => hiddenInput(doc, "reviewer_user_ids[]", String(id))),
    hiddenInput(doc, "dummy-field-just-to-avoid-empty-submit", "foo"),
    hiddenInput(doc, "review_effort_level", "medium"),
  );
  const marker = doc.createElement("span");
  marker.className = "page-sidebar";
  sidebarItem.append(form, marker, ...reviewerRows.map((row) => buildReviewerRow(doc, row)));
  return sidebarItem;
};

export const mountPullRequestPage = (
  doc: Document,
  { tab = "", withForm = true, staleReviewerIds = [] as number[], reviewerRows = [] as ReviewerRow[] } = {},
) => {
  window.history.replaceState({}, "", `${PULL_REQUEST_PATH}${tab}`);
  if (!withForm) return;
  doc.body.append(buildSidebar(doc, { token: "page-token", staleReviewerIds, reviewerRows }));
};

const buildConversationPage = ({
  signedIn = true,
  canRequest = true,
  unreadable = false,
  reviewerRows = [],
  formAction,
}: FakeConversationPage): string => {
  const doc = document.implementation.createHTMLDocument("Pull request");
  if (!unreadable) {
    const login = doc.createElement("meta");
    login.name = "user-login";
    login.content = signedIn ? "current-user" : "";
    doc.head.append(login);
  }
  if (signedIn && canRequest && !unreadable) {
    doc.body.append(
      buildSidebar(doc, { token: "conversation-token", reviewerRows, ...(formAction ? { formAction } : {}) }),
    );
  }
  return doc.documentElement.outerHTML;
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
  `<div class="discussion-sidebar-item js-discussion-sidebar-item"><form action="${PULL_REQUEST_PATH}/review-requests" method="post"><input type="hidden" name="authenticity_token" value="fresh-token"></form><span class="fresh-sidebar">${logins.join(",")}</span></div>`;

const loginRedirect = () => {
  const response = new Response("<html><head></head><body>Sign in</body></html>");
  Object.defineProperty(response, "url", { value: "https://github.com/login?return_to=%2Facme" });
  return response;
};

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

  let conversationFetches = 0;
  const answerConversation = () => {
    conversationFetches += 1;
    const conversation = options.conversation ?? {};
    if (conversation.status !== undefined) return new Response("", { status: conversation.status });
    if (conversation.redirectedToLogin) return loginRedirect();
    return new Response(buildConversationPage(conversation), { headers: { "content-type": "text/html" } });
  };

  const answerPullRequestSearch = (url: URL) => {
    if (options.searchStatus !== undefined) return new Response("", { status: options.searchStatus });
    if (options.searchBody !== undefined) return new Response(options.searchBody);
    const login = /review-requested:(\S+)/.exec(url.searchParams.get("q") ?? "")?.[1] ?? "";
    return Response.json({
      payload: { blackbirdSearchRoute: { result_count: options.openRequestCounts?.[login] ?? 0 } },
    });
  };

  const fakeFetch = vi.fn<typeof fetch>((input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, window.location.origin);
    if (init?.method === "POST") {
      const body = init.body instanceof URLSearchParams ? init.body : new URLSearchParams();
      return Promise.resolve(answerPost(body));
    }
    if (init?.method === "HEAD") return Promise.resolve(answerProfile(url));
    if (url.pathname === PULL_REQUEST_PATH) return Promise.resolve(answerConversation());
    if (url.pathname === "/search") return Promise.resolve(answerPullRequestSearch(url));
    return Promise.resolve(answerSearch(url));
  });

  return {
    fetch: fakeFetch,
    page: { doc: document, fetch: fakeFetch, conversation: new ConversationCache() },
    posts,
    profileChecks,
    conversationFetches: () => conversationFetches,
    requestedLogins,
  };
};
