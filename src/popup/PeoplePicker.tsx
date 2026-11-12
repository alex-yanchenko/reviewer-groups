import type { ReviewerCandidate } from "../messages";
import { isGone, rememberedPerson, type Directory } from "./directory";

const loginKey = (login: string) => login.toLowerCase();

const personFor = (directory: Directory, login: string): ReviewerCandidate => ({
  login,
  description: "",
  avatarUrl: null,
  team: login.includes("/"),
  ...rememberedPerson(directory, login),
  requested: false,
  available: true,
});

const rowsFor = (
  found: ReviewerCandidate[],
  selection: string[],
  directory: Directory,
): ReviewerCandidate[] => {
  const foundKeys = new Set(found.map((candidate) => loginKey(candidate.login)));
  const tickedElsewhere = selection
    .filter((login) => !foundKeys.has(loginKey(login)))
    .map((login) => personFor(directory, login));
  return [...tickedElsewhere, ...found];
};

function PersonItem({
  person,
  ticked,
  gone,
  onToggle,
}: {
  person: ReviewerCandidate;
  ticked: boolean;
  gone: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="person" aria-label={person.login}>
      <label className="person-label">
        <input
          type="checkbox"
          aria-label={person.login}
          checked={ticked}
          disabled={!person.available && !ticked}
          onChange={onToggle}
        />
        {person.avatarUrl ? (
          <img className="avatar" src={person.avatarUrl} alt="" width={20} height={20} />
        ) : (
          <span className="avatar avatar-blank" aria-hidden="true" />
        )}
        <span className="person-text">
          <span className="person-login">{person.login}</span>
          {person.description && <span className="person-description">{person.description}</span>}
        </span>
        {person.team && <span className="badge">team</span>}
        {person.requested && <span className="badge badge-done">requested</span>}
        {!person.available && <span className="badge badge-warn">unavailable</span>}
        {gone && <span className="badge badge-warn">not on GitHub</span>}
      </label>
    </li>
  );
}

export function PeoplePicker({
  found,
  directory,
  selection,
  search,
  problem,
  onSearch,
  onToggle,
}: {
  found: ReviewerCandidate[];
  directory: Directory;
  selection: string[];
  search: string;
  problem: string;
  onSearch: (search: string) => void;
  onToggle: (login: string) => void;
}) {
  const ticked = new Set(selection.map(loginKey));
  const rows = rowsFor(found, selection, directory);

  return (
    <section className="people">
      <input
        className="search"
        type="search"
        aria-label="Search people"
        placeholder="Search everyone who can review"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        autoFocus
      />
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <ul className="people-list" aria-label="People">
        {rows.map((person) => (
          <PersonItem
            key={loginKey(person.login)}
            person={person}
            ticked={ticked.has(loginKey(person.login))}
            gone={isGone(directory, person.login)}
            onToggle={() => onToggle(person.login)}
          />
        ))}
      </ul>
      {found.length === 0 && search.trim().length > 0 && (
        <p className="empty">Nobody matches “{search.trim()}”.</p>
      )}
    </section>
  );
}
