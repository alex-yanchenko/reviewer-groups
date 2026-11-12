import { useState } from "react";
import type { ReviewerCandidate } from "../messages";

interface PersonRow extends ReviewerCandidate {
  offered: boolean;
}

const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const rowsFor = (candidates: ReviewerCandidate[], selection: string[]): PersonRow[] => {
  const notOffered = selection
    .filter((login) => !candidates.some((candidate) => sameLogin(candidate.login, login)))
    .map((login) => ({
      login,
      description: "",
      avatarUrl: null,
      team: login.includes("/"),
      requested: false,
      offered: false,
    }));
  return [...notOffered, ...candidates.map((candidate) => ({ ...candidate, offered: true }))];
};

const matchesSearch = (row: PersonRow, search: string) => {
  const needle = search.trim().toLowerCase();
  return (
    needle.length === 0 ||
    row.login.toLowerCase().includes(needle) ||
    row.description.toLowerCase().includes(needle)
  );
};

function PersonItem({ row, ticked, onToggle }: { row: PersonRow; ticked: boolean; onToggle: () => void }) {
  return (
    <li className="person" aria-label={row.login}>
      <label className="person-label">
        <input type="checkbox" aria-label={row.login} checked={ticked} onChange={onToggle} />
        {row.avatarUrl ? (
          <img className="avatar" src={row.avatarUrl} alt="" width={20} height={20} />
        ) : (
          <span className="avatar avatar-blank" aria-hidden="true" />
        )}
        <span className="person-text">
          <span className="person-login">{row.login}</span>
          {row.description && <span className="person-description">{row.description}</span>}
        </span>
        {row.team && <span className="badge">team</span>}
        {row.requested && <span className="badge badge-done">requested</span>}
        {!row.offered && <span className="badge badge-warn">not offered on this PR</span>}
      </label>
    </li>
  );
}

export function PeoplePicker({
  candidates,
  selection,
  onToggle,
}: {
  candidates: ReviewerCandidate[];
  selection: string[];
  onToggle: (login: string) => void;
}) {
  const [search, setSearch] = useState("");
  const rows = rowsFor(candidates, selection).filter((row) => matchesSearch(row, search));

  return (
    <section className="people">
      <input
        className="search"
        type="search"
        aria-label="Search people"
        placeholder="Search people"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        autoFocus
      />
      <ul className="people-list" aria-label="People">
        {rows.map((row) => (
          <PersonItem
            key={row.login}
            row={row}
            ticked={selection.some((login) => sameLogin(login, row.login))}
            onToggle={() => onToggle(row.login)}
          />
        ))}
      </ul>
      {rows.length === 0 && <p className="empty">Nobody matches “{search.trim()}”.</p>}
    </section>
  );
}
