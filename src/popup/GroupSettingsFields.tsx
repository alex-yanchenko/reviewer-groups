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
    </>
  );
}
