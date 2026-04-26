interface Props {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}

export function BoolToggle({ value, onChange, disabled }: Props) {
  const checked = value === true || value === 'true';
  return (
    <label className="prop-input prop-input--bool">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{checked ? 'on' : 'off'}</span>
    </label>
  );
}
