import { decodePua, encodePua } from '../../../editor/pua';
import { toText, useDraftCommit } from '../useDraftCommit';

interface Props {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}

export function StringInput({ value, onChange, disabled }: Props) {
  const { draft, setDraft, commit } = useDraftCommit(
    value,
    (v) => encodePua(toText(v)),
    decodePua,
    onChange,
  );
  return (
    <input
      type="text"
      className="prop-input"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
