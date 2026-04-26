interface Props {
  label: string;
  value: string;
  opaque?: string;
  origin?: string;
}

/** Read-only fallback row for props not covered by the schema. */
export function ReadOnlyRow({ label, value, opaque, origin }: Props) {
  return (
    <div className="prop-row prop-row--readonly">
      <div className="prop-row__key">{label}</div>
      <div className="prop-row__value">
        {opaque ? <span className="prop-row__opaque">{opaque}</span> : <span>{value}</span>}
      </div>
      {origin && (
        <div className="prop-row__origin">
          from <code>{shortFile(origin)}</code>
        </div>
      )}
    </div>
  );
}

function shortFile(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}
