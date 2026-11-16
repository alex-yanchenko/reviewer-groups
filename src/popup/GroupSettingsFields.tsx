import type { GroupSettingsText } from "./groupSettings";

export function GroupSettingsFields({
  settings,
  onChange,
}: {
  settings: GroupSettingsText;
  onChange: (settings: GroupSettingsText) => void;
}) {
  return (
    <>
      <label className="field">
        <span>Repositories</span>
        <input
          value={settings.repos}
          onChange={(event) => onChange({ ...settings, repos: event.target.value })}
          placeholder="acme/widgets, acme/*"
        />
      </label>
      <p className="hint">Optional. On these repositories' pull requests the group is listed first.</p>
      <label className="field">
        <span>Ask how many</span>
        <input
          value={settings.ask}
          onChange={(event) => onChange({ ...settings, ask: event.target.value })}
          inputMode="numeric"
          placeholder="Everyone"
        />
      </label>
      <p className="hint">
        Optional. Requests this many members, those with the fewest open review requests.
      </p>
    </>
  );
}
