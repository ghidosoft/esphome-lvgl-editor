import { useState } from 'react';

/**
 * Draft-text state synced to a typed external `value`, with commit-on-blur
 * semantics. Centralises the pattern duplicated across StringInput,
 * NumericField, SizeInput and ColorSwatch.
 *
 * - `encode`: external value → draft string (initial render + when value changes upstream).
 * - `parse`: draft string → next external value. Returning the same encoded text or `NaN`
 *   skips the commit (matches the previous `commitIfChanged` semantics).
 */
export function useDraftCommit(
  value: unknown,
  encode: (v: unknown) => string,
  parse: (s: string) => unknown,
  onChange: (next: unknown) => void,
) {
  const [draft, setDraft] = useState(() => encode(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(encode(value));
  }
  const commit = () => {
    const parsed = parse(draft);
    if (parsed === encode(value)) return;
    if (typeof parsed === 'number' && Number.isNaN(parsed)) return;
    onChange(parsed);
  };
  return { draft, setDraft, commit };
}

export function toText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
