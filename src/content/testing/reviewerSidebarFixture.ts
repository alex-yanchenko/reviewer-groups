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
  savedSelections: string[][];
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

const checkedLogins = (form: HTMLFormElement): string[] =>
  [...form.querySelectorAll<HTMLLabelElement>('label[role="menuitemcheckbox"]')]
    .filter((label) => label.querySelector<HTMLInputElement>("input")?.checked)
    .map((label) => label.querySelector(".js-username")?.textContent ?? "");

export const mountReviewerSidebar = (
  doc: Document,
  candidates: Candidate[],
  { optionsLoadAfterMs = 0, optionsNeverLoad = false } = {},
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
  const list = doc.createElement("div");
  list.setAttribute("data-filterable-for", "review-filter-field");
  menu.append(list);
  details.append(summary, menu);
  form.append(details);
  sidebarItem.append(form);
  doc.body.append(sidebarItem);

  const fixture: ReviewerSidebarFixture = { form, details, savedSelections: [] };
  details.addEventListener("toggle", () => {
    if (!details.open) {
      fixture.savedSelections.push(checkedLogins(form));
      return;
    }
    if (optionsNeverLoad || list.childElementCount > 0) return;
    setTimeout(
      () => list.append(...candidates.map((candidate) => buildOption(doc, candidate))),
      optionsLoadAfterMs,
    );
  });
  return fixture;
};
