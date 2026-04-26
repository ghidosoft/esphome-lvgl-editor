import { toHexColor, toLvglHex } from '../../../editor/colors';
import { toText, useDraftCommit } from '../useDraftCommit';

interface Props {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}

/**
 * Pairs a native color picker (which only speaks `#rrggbb`) with a text field
 * so users can paste `0xRRGGBB` values matching how ESPHome colors are spelled
 * in YAML. The picker and the text stay in sync.
 */
export function ColorSwatch({ value, onChange, disabled }: Props) {
  const current = toText(value);
  const hex = toHexColor(current);
  const { draft, setDraft, commit } = useDraftCommit(value, toText, (s) => s, onChange);

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
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </div>
  );
}
