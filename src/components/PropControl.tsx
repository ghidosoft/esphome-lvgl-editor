import { useState } from 'react';
import type { SchemaEntry } from '../editor/schema';
import { toHexColor, toLvglHex } from '../editor/colors';
import { decodePua, encodePua } from '../editor/pua';

interface Props {
  entry: SchemaEntry;
  value: unknown;
  onChange: (newValue: unknown) => void;
  disabled?: boolean;
}

/**
 * Dispatch to the right editor control for a schema entry. Each control owns
 * its local string state so typing feels responsive; it commits to the store
 * on blur or meaningful change (dropdown, color picker).
 */
export function PropControl({ entry, value, onChange, disabled }: Props) {
  switch (entry.kind) {
    case 'string':
      return <StringInput value={value} onChange={onChange} disabled={disabled} />;
    case 'number':
      return <NumberInput entry={entry} value={value} onChange={onChange} disabled={disabled} />;
    case 'size':
      return <SizeInput value={value} onChange={onChange} disabled={disabled} />;
    case 'color':
      return <ColorInput value={value} onChange={onChange} disabled={disabled} />;
    case 'enum':
    case 'align':
      return (
        <EnumSelect
          value={value}
          options={entry.enum ?? []}
          onChange={onChange}
          disabled={disabled}
        />
      );
  }
}

function StringInput({
  value,
  onChange,
  disabled,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(() => encodePua(toText(value)));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(encodePua(toText(value)));
  }
  return (
    <input
      type="text"
      className="prop-input"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commitIfChanged(draft, value, onChange, decodePua)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

function NumberInput({
  entry,
  value,
  onChange,
  disabled,
}: {
  entry: SchemaEntry;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(toText(value));
  }
  return (
    <div className="prop-input-group">
      <input
        type="number"
        className="prop-input"
        value={draft}
        disabled={disabled}
        min={entry.min}
        max={entry.max}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() =>
          commitIfChanged(draft, value, onChange, (s) => (s === '' ? undefined : Number(s)))
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {entry.unit && <span className="prop-input__unit">{entry.unit}</span>}
    </div>
  );
}

/**
 * Size accepts raw numbers (px), percentages (e.g. "100%"), and the literal
 * `SIZE_CONTENT`. We keep a plain text input because the domain is too varied
 * for a native <input type=number>.
 */
function SizeInput({
  value,
  onChange,
  disabled,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(toText(value));
  }
  return (
    <input
      type="text"
      className="prop-input"
      value={draft}
      disabled={disabled}
      placeholder="e.g. 100, 100%, SIZE_CONTENT"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commitIfChanged(draft, value, onChange, parseSize)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

function parseSize(s: string): unknown {
  const t = s.trim();
  if (t === '') return undefined;
  if (t.toUpperCase() === 'SIZE_CONTENT') return 'SIZE_CONTENT';
  if (t.endsWith('%')) return t;
  const n = Number(t);
  return Number.isNaN(n) ? t : n;
}

/**
 * Pairs a native color picker (which only speaks `#rrggbb`) with a text field
 * so users can paste `0xRRGGBB` values matching how ESPHome colors are spelled
 * in YAML. The picker and the text stay in sync.
 */
function ColorInput({
  value,
  onChange,
  disabled,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const current = toText(value);
  const hex = toHexColor(current);
  const [draft, setDraft] = useState(current);
  const [lastCurrent, setLastCurrent] = useState(current);
  if (current !== lastCurrent) {
    setLastCurrent(current);
    setDraft(current);
  }

  return (
    <div className="prop-input-group">
      <input
        type="color"
        className="prop-input__color-picker"
        value={hex ?? '#000000'}
        disabled={disabled}
        onChange={(e) => {
          const next = toLvglHex(e.target.value);
          setDraft(next);
          onChange(next);
        }}
      />
      <input
        type="text"
        className="prop-input"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitIfChanged(draft, value, onChange, (s) => s)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </div>
  );
}

function EnumSelect({
  value,
  options,
  onChange,
  disabled,
}: {
  value: unknown;
  options: string[];
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
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

function toText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function commitIfChanged(
  draft: string,
  current: unknown,
  onChange: (v: unknown) => void,
  parse: (s: string) => unknown,
) {
  const parsed = parse(draft);
  if (parsed === toText(current)) return;
  if (typeof parsed === 'number' && Number.isNaN(parsed)) return;
  onChange(parsed);
}
