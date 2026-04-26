import { toText } from '../useDraftCommit';

interface Props {
  value: unknown;
  options: string[];
  onChange: (v: unknown) => void;
  disabled?: boolean;
}

export function EnumSelect({ value, options, onChange, disabled }: Props) {
  const current = toText(value);
  // If the current value isn't in the enum, surface it as the first option so
  // the user can see it (otherwise the select would silently fall back to the
  // first valid entry and misrepresent the source).
  const extended = options.includes(current) || current === '' ? options : [current, ...options];
  return (
    <select
      className="prop-input"
      value={current}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {current === '' && <option value="">—</option>}
      {extended.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
