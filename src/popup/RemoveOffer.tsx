export function RemoveOffer({
  logins,
  busy,
  locked,
  onRemove,
}: {
  logins: string[];
  busy: boolean;
  locked: boolean;
  onRemove: () => void;
}) {
  if (logins.length === 0) return null;
  return (
    <section className="panel" aria-label="Remove the people just requested">
      <p className="hint">GitHub has already notified them.</p>
      <div className="actions">
        <button type="button" className="btn" disabled={locked} onClick={onRemove}>
          {busy ? "Removing…" : `Remove ${logins.join(", ")}`}
        </button>
      </div>
    </section>
  );
}
