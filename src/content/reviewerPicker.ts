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

interface ReviewerOption {
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

const readOptionsByLogin = (form: HTMLFormElement): Map<string, ReviewerOption> => {
  const options = new Map<string, ReviewerOption>();
  for (const label of form.querySelectorAll<HTMLLabelElement>(PICKER_OPTION)) {
    const login = label.querySelector(".js-username")?.textContent?.trim();
    const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (login && input) options.set(login.toLowerCase(), { label, input });
  }
  return options;
};

const isTicked = (option: ReviewerOption) =>
  option.input.checked || option.label.getAttribute("aria-checked") === "true";

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

export const requestReviewFrom = async (
  doc: Document,
  members: readonly string[],
  { timeoutMs }: { timeoutMs: number },
): Promise<ReviewRequestOutcome> => {
  const picker = findPicker(doc);
  setPickerOpen(picker, true);
  try {
    await pWaitFor(() => readOptionsByLogin(picker.form).size > 0, {
      interval: 50,
      timeout: { milliseconds: timeoutMs, message: new ReviewerOptionsTimeoutError(timeoutMs) },
    });
    return tickMembers(readOptionsByLogin(picker.form), members);
  } finally {
    setPickerOpen(picker, false);
  }
};
