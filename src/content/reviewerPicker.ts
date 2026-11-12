import pWaitFor from "p-wait-for";

const PICKER_FORM = 'form[action$="/review-requests"]';
const PICKER_OPTION = 'label[role="menuitemcheckbox"]';

export interface ReviewRequestOutcome {
  added: string[];
  alreadyRequested: string[];
  notFound: string[];
}

export class ReviewerPickerMissingError extends Error {
  override readonly name = "ReviewerPickerMissingError";
  constructor() {
    super("This page has no Reviewers picker. Open the pull request's Conversation tab.");
  }
}

export class ReviewerOptionsTimeoutError extends Error {
  override readonly name = "ReviewerOptionsTimeoutError";
  constructor(timeoutMs: number) {
    super(`GitHub's Reviewers picker did not load its list within ${timeoutMs} ms.`);
  }
}

interface ReviewerPicker {
  form: HTMLFormElement;
  details: HTMLDetailsElement;
  summary: HTMLElement;
}

export interface ReviewerCandidate {
  login: string;
  description: string;
  avatarUrl: string | null;
  team: boolean;
  requested: boolean;
}

interface ReviewerOption {
  login: string;
  label: HTMLLabelElement;
  input: HTMLInputElement;
}

const findPicker = (doc: Document): ReviewerPicker => {
  const form = doc.querySelector<HTMLFormElement>(PICKER_FORM);
  const details = form?.querySelector("details");
  const summary = details?.querySelector<HTMLElement>(":scope > summary");
  if (!form || !details || !summary) throw new ReviewerPickerMissingError();
  return { form, details, summary };
};

const setPickerOpen = (picker: ReviewerPicker, open: boolean) => {
  if (picker.details.open !== open) picker.summary.click();
};

const readOption = (label: HTMLLabelElement): ReviewerOption[] => {
  const login = label.querySelector(".js-username")?.textContent?.trim();
  const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]');
  return login && input ? [{ login, label, input }] : [];
};

const readOptions = (form: HTMLFormElement): ReviewerOption[] =>
  [...form.querySelectorAll<HTMLLabelElement>(PICKER_OPTION)].flatMap(readOption);

const readOptionsByLogin = (form: HTMLFormElement): Map<string, ReviewerOption> =>
  new Map(readOptions(form).map((option) => [option.login.toLowerCase(), option]));

const isTicked = (option: ReviewerOption) =>
  option.input.checked || option.label.getAttribute("aria-checked") === "true";

const visibleAvatarUrl = (label: HTMLLabelElement): string | null => {
  const avatar = label.querySelector("img");
  return avatar !== null && !avatar.hidden && avatar.src.length > 0 ? avatar.src : null;
};

const describeOption = (option: ReviewerOption): ReviewerCandidate => ({
  login: option.login,
  description: option.label.querySelector(".js-description")?.textContent?.trim() ?? "",
  avatarUrl: visibleAvatarUrl(option.label),
  team: option.input.name.startsWith("reviewer_team_ids"),
  requested: isTicked(option),
});

const tickMembers = (
  options: Map<string, ReviewerOption>,
  members: readonly string[],
): ReviewRequestOutcome => {
  const outcome: ReviewRequestOutcome = { added: [], alreadyRequested: [], notFound: [] };
  for (const member of members) {
    const option = options.get(member.toLowerCase());
    if (option === undefined) {
      outcome.notFound.push(member);
    } else if (isTicked(option)) {
      outcome.alreadyRequested.push(member);
    } else {
      option.label.click();
      outcome.added.push(member);
    }
  }
  return outcome;
};

const withPickerOpen = async <T>(
  doc: Document,
  timeoutMs: number,
  readLoadedForm: (form: HTMLFormElement) => T,
): Promise<T> => {
  const picker = findPicker(doc);
  setPickerOpen(picker, true);
  try {
    await pWaitFor(() => readOptions(picker.form).length > 0, {
      interval: 50,
      timeout: { milliseconds: timeoutMs, message: new ReviewerOptionsTimeoutError(timeoutMs) },
    });
    return readLoadedForm(picker.form);
  } finally {
    setPickerOpen(picker, false);
  }
};

export const requestReviewFrom = (
  doc: Document,
  members: readonly string[],
  { timeoutMs }: { timeoutMs: number },
): Promise<ReviewRequestOutcome> =>
  withPickerOpen(doc, timeoutMs, (form) => tickMembers(readOptionsByLogin(form), members));

export const readReviewerCandidates = (
  doc: Document,
  { timeoutMs }: { timeoutMs: number },
): Promise<ReviewerCandidate[]> =>
  withPickerOpen(doc, timeoutMs, (form) => readOptions(form).map(describeOption));
