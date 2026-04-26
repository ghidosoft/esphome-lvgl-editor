import { toText, useDraftCommit } from '../useDraftCommit';

interface Props {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}

/**
 * Size accepts raw numbers (px), percentages (e.g. "100%"), and the literal
 * `SIZE_CONTENT`. We keep a plain text input because the domain is too varied
 * for a native <input type=number>.
 */
export function SizeInput({ value, onChange, disabled }: Props) {
  const { draft, setDraft, commit } = useDraftCommit(value, toText, parseSize, onChange);
  return (
    <input
      type="text"
      className="prop-input"
      value={draft}
      disabled={disabled}
      placeholder="e.g. 100, 100%, SIZE_CONTENT"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
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
