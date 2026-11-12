export interface Candidate {
  login: string;
  id: number;
  requested?: boolean;
  team?: boolean;
  description?: string;
  avatarUrl?: string;
}

export interface ReviewerSidebarFixture {
  form: HTMLFormElement;
  details: HTMLDetailsElement;
  filter: HTMLInputElement;
  savedSelections: string[][];
}

export interface ReviewerSidebarOptions {
  optionsLoadAfterMs?: number;
  optionsNeverLoad?: boolean;
  foundOnlyBySearch?: Candidate[];
}

const buildOption = (doc: Document, candidate: Candidate): HTMLLabelElement => {
  const label = doc.createElement("label");
  label.setAttribute("role", "menuitemcheckbox");
  label.setAttribute("aria-checked", String(candidate.requested ?? false));
  const input = doc.createElement("input");
  input.type = "checkbox";
  input.hidden = true;
  input.name = candidate.team ? "reviewer_team_ids[]" : "reviewer_user_ids[]";
  input.value = String(candidate.id);
  input.checked = candidate.requested ?? false;
  const avatar = doc.createElement("img");
  avatar.className = "avatar-small";
  if (candidate.avatarUrl === undefined) avatar.hidden = true;
  else avatar.src = candidate.avatarUrl;
  const username = doc.createElement("span");
  username.className = "js-username";
  username.textContent = candidate.login;
  const description = doc.createElement("span");
  description.className = "description js-description";
  description.textContent = candidate.description ?? "";
  label.append(input, avatar, username, description);
  return label;
};

const optionLogins = (form: HTMLFormElement, onlyChecked: boolean): string[] =>
  [...form.querySelectorAll<HTMLLabelElement>('label[role="menuitemcheckbox"]')]
    .filter((label) => !onlyChecked || label.querySelector<HTMLInputElement>("input")?.checked)
    .map((label) => label.querySelector(".js-username")?.textContent ?? "");

export const mountReviewerSidebar = (
  doc: Document,
  candidates: Candidate[],
  { optionsLoadAfterMs = 0, optionsNeverLoad = false, foundOnlyBySearch = [] }: ReviewerSidebarOptions = {},
): ReviewerSidebarFixture => {
  const sidebarItem = doc.createElement("div");
  sidebarItem.className = "discussion-sidebar-item";
  const form = doc.createElement("form");
  form.action = "/acme/widgets/pull/7/review-requests";
  form.method = "post";
  const details = doc.createElement("details");
  const summary = doc.createElement("summary");
  summary.textContent = "Reviewers";
  const menu = doc.createElement("details-menu");
  const filter = doc.createElement("input");
  filter.type = "text";
  filter.className = "form-control js-filterable-field";
  const list = doc.createElement("div");
  list.setAttribute("data-filterable-for", "review-filter-field");
  menu.append(filter, list);
  details.append(summary, menu);
  form.append(details);
  sidebarItem.append(form);
  doc.body.append(sidebarItem);

  const fixture: ReviewerSidebarFixture = { form, details, filter, savedSelections: [] };
  details.addEventListener("toggle", () => {
    if (!details.open) fixture.savedSelections.push(optionLogins(form, true));
  });
  filter.addEventListener("focus", () => {
    if (!details.open || optionsNeverLoad || list.childElementCount > 0) return;
    setTimeout(
      () => list.append(...candidates.map((candidate) => buildOption(doc, candidate))),
      optionsLoadAfterMs,
    );
  });
  filter.addEventListener("input", () => {
    const needle = filter.value.toLowerCase();
    if (needle.length === 0) return;
    const shown = new Set(optionLogins(form, false));
    const matches = foundOnlyBySearch.filter(
      (candidate) => candidate.login.toLowerCase().includes(needle) && !shown.has(candidate.login),
    );
    setTimeout(() => list.append(...matches.map((candidate) => buildOption(doc, candidate))), 20);
  });
  return fixture;
};
