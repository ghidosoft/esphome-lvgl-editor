import { useMemo } from 'react';

type TrackKind = 'fr' | 'content' | 'px';

interface Track {
  kind: TrackKind;
  /** Ignored when kind === 'content'. */
  value: number;
}

interface Props {
  /** YAML-shape array as it appears in `grid_rows`/`grid_columns`. */
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}

/**
 * Editor for `grid_rows` / `grid_columns`. Each track is one of:
 *  - `FR(N)`  — fractional unit, shares remaining space proportionally
 *  - `content`— intrinsic size of the contained children
 *  - `<px>`   — fixed pixel size
 *
 * Reads loosely (mirroring the parser at `parseTracks`) so legacy YAML
 * (`'120'` as string) renders correctly. Writes normalised YAML strings/numbers
 * so the file diff is predictable.
 */
export function TracksField({ value, onChange, disabled }: Props) {
  const tracks = useMemo(() => parseTracks(value), [value]);

  const commit = (next: Track[]) => {
    onChange(next.map(formatTrack));
  };

  const updateAt = (i: number, patch: Partial<Track>) => {
    const next = tracks.map((t, idx) => (idx === i ? { ...t, ...patch } : t));
    commit(next);
  };

  const removeAt = (i: number) => {
    commit(tracks.filter((_, idx) => idx !== i));
  };

  const append = () => {
    commit([...tracks, { kind: 'fr', value: 1 }]);
  };

  return (
    <div className="tracks-field">
      {tracks.length === 0 && <div className="tracks-field__empty">no tracks</div>}
      {tracks.map((t, i) => (
        <div className="tracks-field__row" key={i}>
          <select
            className="prop-input tracks-field__kind"
            value={t.kind}
            disabled={disabled}
            onChange={(e) => updateAt(i, { kind: e.target.value as TrackKind })}
          >
            <option value="fr">FR</option>
            <option value="content">content</option>
            <option value="px">px</option>
          </select>
          {t.kind !== 'content' && (
            <input
              type="number"
              className="prop-input prop-input--number tracks-field__value"
              value={Number.isFinite(t.value) ? t.value : 0}
              disabled={disabled}
              min={t.kind === 'fr' ? 0 : undefined}
              step={t.kind === 'fr' ? 0.1 : 1}
              onChange={(e) => updateAt(i, { value: Number(e.target.value) })}
            />
          )}
          <button
            type="button"
            className="prop-row__btn prop-row__btn--danger tracks-field__remove"
            title="Remove track"
            disabled={disabled}
            onClick={() => removeAt(i)}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="tracks-field__add" disabled={disabled} onClick={append}>
        + Add track
      </button>
    </div>
  );
}

function parseTracks(raw: unknown): Track[] {
  if (!Array.isArray(raw)) return [];
  const out: Track[] = [];
  for (const item of raw) {
    if (typeof item === 'number') {
      out.push({ kind: 'px', value: item });
      continue;
    }
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.toLowerCase() === 'content') {
      out.push({ kind: 'content', value: 0 });
      continue;
    }
    const fr = /^fr\((\d+(?:\.\d+)?)\)$/i.exec(trimmed);
    if (fr) {
      out.push({ kind: 'fr', value: parseFloat(fr[1]) });
      continue;
    }
    const num = Number(trimmed);
    if (!Number.isNaN(num)) out.push({ kind: 'px', value: num });
  }
  return out;
}

function formatTrack(t: Track): string | number {
  if (t.kind === 'content') return 'content';
  if (t.kind === 'fr') {
    const v = Number.isFinite(t.value) ? t.value : 1;
    return `FR(${Number.isInteger(v) ? v : v})`;
  }
  return Number.isFinite(t.value) ? t.value : 0;
}
