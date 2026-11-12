import pWaitFor from "p-wait-for";
import * as z from "zod/mini";

const PICKER_FORM = 'form[action$="/review-requests"]';
const PICKER_OPTION = 'label[role="menuitemcheckbox"]';
const PICKER_FILTER = "input.js-filterable-field";

export interface ReviewRequestOutcome {
  added: string[];
  alreadyRequested: string[];
  notFound: string[];
}

export interface ReviewerCandidate {
  login: string;
  description: string;
  avatarUrl: string | null;
  team: boolean;
  requested: boolean;
}

export interface PickerTimeouts {
  timeoutMs: number;
  searchTimeoutMs: number;
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

export class ReviewerSearchFailedError extends Error {
  override readonly name = "ReviewerSearchFailedError";
  constructor(status: number) {
    super(`GitHub's reviewer search answered ${status}.`);
  }
}

interface ReviewerPicker {
  form: HTMLFormElement;
  details: HTMLDetailsElement;
  summary: HTMLElement;
  filter: HTMLInputElement | null;
}

interface ReviewerOption {
  login: string;
  label: HTMLLabelElement;
  input: HTMLInputElement;
}

const searchEntrySchema = z.object({
  login: z.string(),
  type: z.string(),
  selected: z.boolean(),
  avatar: z.optional(z.string()),
  name: z.optional(z.unknown()),
  description: z.optional(z.string()),
});

const searchAnswerSchema = z.object({
  suggestions: z.optional(z.array(z.unknown())),
  users: z.optional(z.array(z.unknown())),
});

const findPicker = (doc: Document): ReviewerPicker => {
  const form = doc.querySelector<HTMLFormElement>(PICKER_FORM);
  const details = form?.querySelector("details");
  const summary = details?.querySelector<HTMLElement>(":scope > summary");
  if (!form || !details || !summary) throw new ReviewerPickerMissingError();
  return { form, details, summary, filter: details.querySelector<HTMLInputElement>(PICKER_FILTER) };
};

const nudgeListToLoad = (picker: ReviewerPicker) => {
  picker.filter?.dispatchEvent(new FocusEvent("focus"));
};

const openPicker = (picker: ReviewerPicker) => {
  if (!picker.details.open) picker.summary.click();
  nudgeListToLoad(picker);
};

const closePicker = (picker: ReviewerPicker) => {
  if (picker.details.open) picker.summary.click();
};

const typeIntoFilter = (filter: HTMLInputElement, text: string) => {
  filter.value = text;
  filter.dispatchEvent(new Event("input", { bubbles: true }));
};

const readOption = (label: HTMLLabelElement): ReviewerOption[] => {
  const login = label.querySelector(".js-username")?.textContent?.trim();
  const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]');
  return login && input ? [{ login, label, input }] : [];
};

const readOptions = (form: HTMLFormElement): ReviewerOption[] =>
  [...form.querySelectorAll<HTMLLabelElement>(PICKER_OPTION)].flatMap(readOption);

const findLoadedOption = (form: HTMLFormElement, login: string): ReviewerOption | undefined =>
  readOptions(form).find((option) => option.login.toLowerCase() === login.toLowerCase());

const findOptionBySearching = async (
  picker: ReviewerPicker,
  login: string,
  searchTimeoutMs: number,
): Promise<ReviewerOption | undefined> => {
  const loaded = findLoadedOption(picker.form, login);
  if (loaded !== undefined || picker.filter === null) return loaded;
  typeIntoFilter(picker.filter, login);
  await pWaitFor(() => findLoadedOption(picker.form, login) !== undefined, {
    interval: 50,
    timeout: { milliseconds: searchTimeoutMs, fallback: () => undefined },
  });
  return findLoadedOption(picker.form, login);
};

const isTicked = (option: ReviewerOption) =>
  option.input.checked || option.label.getAttribute("aria-checked") === "true";

const tickMembers = async (
  picker: ReviewerPicker,
  members: readonly string[],
  searchTimeoutMs: number,
): Promise<ReviewRequestOutcome> => {
  const outcome: ReviewRequestOutcome = { added: [], alreadyRequested: [], notFound: [] };
  for (const member of members) {
    const option = await findOptionBySearching(picker, member, searchTimeoutMs);
    if (option === undefined) {
      outcome.notFound.push(member);
    } else if (isTicked(option)) {
      outcome.alreadyRequested.push(member);
    } else {
      option.label.click();
      outcome.added.push(member);
    }
  }
  if (picker.filter !== null && picker.filter.value !== "") typeIntoFilter(picker.filter, "");
  return outcome;
};

export const requestReviewFrom = async (
  doc: Document,
  members: readonly string[],
  { timeoutMs, searchTimeoutMs }: PickerTimeouts,
): Promise<ReviewRequestOutcome> => {
  const picker = findPicker(doc);
  openPicker(picker);
  try {
    await pWaitFor(() => readOptions(picker.form).length > 0, {
      interval: 50,
      timeout: { milliseconds: timeoutMs, message: new ReviewerOptionsTimeoutError(timeoutMs) },
    });
    return await tickMembers(picker, members, searchTimeoutMs);
  } finally {
    closePicker(picker);
  }
};

const describeEntry = (raw: unknown): ReviewerCandidate[] => {
  const result = searchEntrySchema.safeParse(raw);
  if (!result.success) return [];
  const { login, type, selected, avatar, name, description } = result.data;
  return [
    {
      login,
      description: typeof name === "string" && name.length > 0 ? name : (description ?? ""),
      avatarUrl: avatar ?? null,
      team: type === "team",
      requested: selected,
    },
  ];
};

export const searchReviewerCandidates = async (
  doc: Document,
  query: string,
  fetchReviewers: typeof fetch,
): Promise<ReviewerCandidate[]> => {
  const { form } = findPicker(doc);
  const url = new URL(form.action);
  url.searchParams.set("typeAhead", "true");
  url.searchParams.set("q", query);
  const response = await fetchReviewers(url.href, {
    headers: { "X-Requested-With": "XMLHttpRequest" },
    credentials: "same-origin",
  });
  if (!response.ok) throw new ReviewerSearchFailedError(response.status);
  const answer = searchAnswerSchema.safeParse(await response.json());
  if (!answer.success) return [];
  return [...(answer.data.suggestions ?? []), ...(answer.data.users ?? [])].flatMap(describeEntry);
};
