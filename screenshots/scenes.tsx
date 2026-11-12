import pWaitFor from "p-wait-for";
import { createRoot } from "react-dom/client";
import type { Group } from "../src/groups/group";
import type { ListReviewersReply, RequestReviewReply, ReviewerCandidate } from "../src/messages";
import { App } from "../src/popup/App";
import type { Draft } from "../src/popup/draft";
import "../src/popup/popup.css";
import "./scenes.css";

interface Person {
  login: string;
  name: string;
  color: string;
  team?: boolean;
  requested?: boolean;
}

const avatarFor = ({ name, color, team }: Person): string => {
  const initials = name
    .split(" ")
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const shape = team
    ? `<rect width="40" height="40" rx="8" fill="${color}"/>`
    : `<circle cx="20" cy="20" r="20" fill="${color}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${shape}<text x="20" y="25" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="15" font-weight="600" fill="#fff">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const suggested: Person[] = [
  { login: "river-chen", name: "River Chen", color: "#2f81f7" },
  { login: "priya-nair", name: "Priya Nair", color: "#bf3989" },
  { login: "sam-okafor", name: "Sam Okafor", color: "#1a7f37" },
  { login: "leo-martins", name: "Leo Martins", color: "#9a6700", requested: true },
  { login: "noor-haddad", name: "Noor Haddad", color: "#8250df" },
  { login: "northwind/frontend", name: "Frontend guild", color: "#0969da", team: true },
];

const foundBySearch: Person[] = [
  { login: "maya-kowalski", name: "Maya Kowalski", color: "#cf222e" },
  { login: "malik-osei", name: "Malik Osei", color: "#116329" },
  { login: "tomas-marin", name: "Tomas Marin", color: "#953800" },
];

const toCandidate = (person: Person): ReviewerCandidate => ({
  login: person.login,
  description: person.name,
  avatarUrl: avatarFor(person),
  available: true,
  team: person.team ?? false,
  requested: person.requested ?? false,
});

const listReviewers = (query: string): Promise<ListReviewersReply> => {
  const needle = query.toLowerCase();
  const people =
    needle === ""
      ? suggested
      : [...suggested, ...foundBySearch].filter(
          (person) => person.login.includes(needle) || person.name.toLowerCase().includes(needle),
        );
  return Promise.resolve({ ok: true, candidates: people.map(toCandidate) });
};

const groups: Group[] = [
  { id: "g1", name: "Frontend", members: ["river-chen", "priya-nair", "northwind/frontend"] },
  { id: "g2", name: "Payments", members: ["sam-okafor", "maya-kowalski"] },
];

const requestReview = (members: string[]): Promise<RequestReviewReply> =>
  Promise.resolve({
    ok: true,
    outcome: { added: members, alreadyRequested: [], unavailable: [], notFound: [], unconfirmed: [] },
  });

interface Scene {
  title: string;
  caption: string;
  groups: Group[];
  draft: Draft;
  play: () => Promise<void>;
}

class SceneElementMissingError extends Error {
  override readonly name = "SceneElementMissingError";
  constructor(elementName: string) {
    super(`The scene never showed "${elementName}".`);
  }
}

const findButton = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (button) => button.textContent === name || button.getAttribute("aria-label") === name,
  );

const waitForButton = async (name: string): Promise<HTMLButtonElement> => {
  await pWaitFor(() => findButton(name) !== undefined, { interval: 20, timeout: 3000 });
  const button = findButton(name);
  if (button === undefined) throw new SceneElementMissingError(name);
  return button;
};

const typeInto = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const waitForInput = async (label: string): Promise<HTMLInputElement> => {
  const find = () =>
    document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) ??
    [...document.querySelectorAll<HTMLLabelElement>("label.field")]
      .find((field) => field.textContent?.startsWith(label))
      ?.querySelector("input") ??
    null;
  await pWaitFor(() => find() !== null, { interval: 20, timeout: 3000 });
  const input = find();
  if (input === null) throw new SceneElementMissingError(label);
  return input;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

const scenes: Record<string, Scene> = {
  pick: {
    title: "Tick reviewers. Request them all at once.",
    caption: "Open it on a pull request: everyone GitHub lets you request is listed, teams included.",
    groups: [],
    draft: { selection: ["river-chen", "priya-nair", "northwind/frontend"], editingGroupId: null },
    play: async () => {
      await waitForButton("Request 3");
    },
  },
  groups: {
    title: "Save a group. Request it in two clicks.",
    caption: "Click the icon, click the group. Requests go through GitHub's own Reviewers menu.",
    groups,
    draft: { selection: [], editingGroupId: null },
    play: async () => {
      (await waitForButton("Request Frontend")).click();
      await pWaitFor(() => document.querySelector('[role="status"]') !== null, { timeout: 3000 });
    },
  },
  search: {
    title: "Search everyone who can review.",
    caption: "Not only the suggestions: search finds anyone GitHub would let you request.",
    groups: [],
    draft: { selection: ["maya-kowalski"], editingGroupId: null },
    play: async () => {
      typeInto(await waitForInput("Search people"), "ma");
      await pWaitFor(() => document.body.textContent?.includes("Tomas Marin") ?? false, { timeout: 3000 });
    },
  },
  save: {
    title: "No token. No setup.",
    caption: "It uses the GitHub session you are already signed in with, and only the tab you click it on.",
    groups: groups.slice(0, 1),
    draft: { selection: ["sam-okafor", "noor-haddad", "priya-nair"], editingGroupId: null },
    play: async () => {
      (await waitForButton("Save as group")).click();
      typeInto(await waitForInput("Group name"), "Payments");
    },
  },
};

const renderPromo = (root: HTMLElement) => {
  document.body.classList.add("promo");
  createRoot(root).render(
    <div className="promo-tile">
      <img src="../icons/icon-128.png" alt="" width={96} height={96} />
      <div>
        <h1>Reviewer Groups</h1>
        <p>Request GitHub reviews from a whole group in two clicks.</p>
      </div>
    </div>,
  );
  document.body.dataset.ready = "true";
};

const renderScene = async (root: HTMLElement, scene: Scene) => {
  createRoot(root).render(
    <div className="stage">
      <section className="pitch">
        <img src="../icons/icon-128.png" alt="" width={72} height={72} />
        <h1>{scene.title}</h1>
        <p>{scene.caption}</p>
      </section>
      <section className="window">
        <App
          store={{
            load: () => Promise.resolve({ groups: scene.groups, unreadable: 0 }),
            save: () => Promise.resolve(),
          }}
          drafts={{ load: () => Promise.resolve(scene.draft), save: () => Promise.resolve() }}
          requestReview={requestReview}
          listReviewers={listReviewers}
          newId={() => "demo"}
          pullRequest="northwind/storefront#482"
        />
      </section>
    </div>,
  );
  await scene.play();
  await settle();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  document.body.dataset.ready = "true";
};

const root = document.getElementById("root");
const sceneName = location.hash.slice(1);
const scene = scenes[sceneName];
if (root !== null && sceneName === "promo") renderPromo(root);
else if (root !== null && scene !== undefined) void renderScene(root, scene);
