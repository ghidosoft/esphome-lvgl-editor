import { useState } from 'react';
import { Icon } from '../Icon';
import { toText, useDraftCommit } from '../useDraftCommit';
import type { IconId } from '../../../editor/schema';

export interface DimensionSide {
  key: string;
  label: string;
  value: unknown;
  dirty: boolean;
  disabled: boolean;
  origin?: string;
}

interface Props {
  sides: DimensionSide[];
  iconName: IconId;
  groupLabel: string;
  /** localStorage suffix; persists the lock state across reloads. */
  linkPrefKey: string;
  onSideChange: (key: string, value: unknown) => void;
  /** Broadcast: write the same value to every side. Called when locked. */
  onAllChange: (value: unknown) => void;
  onRevertAll?: () => void;
}

const STORAGE_PREFIX = 'inspector.linked.';

function loadLinkedPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + key);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    // ignore
  }
  return fallback;
}

function saveLinkedPref(key: string, linked: boolean) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, linked ? '1' : '0');
  } catch {
    // ignore
  }
}

/**
 * Compact 4-up control for related dimensional values (currently padding T/R/B/L).
 * The lock toggle is purely a write-time switch: when on, editing any cell
 * broadcasts the new value to every side; when off, edits go to that side
 * only. Per-side dirty state stays independent so the user can see at a
 * glance which sides are pending.
 */
export function DimensionGrid({
  sides,
  iconName,
  groupLabel,
  linkPrefKey,
  onSideChange,
  onAllChange,
  onRevertAll,
}: Props) {
  const [linked, setLinked] = useState(() => loadLinkedPref(linkPrefKey, true));
  const toggleLock = () => {
    const next = !linked;
    setLinked(next);
    saveLinkedPref(linkPrefKey, next);
  };

  const anyDirty = sides.some((s) => s.dirty);

  const handleCellChange = (sideKey: string, value: unknown) => {
    if (linked) onAllChange(value);
    else onSideChange(sideKey, value);
  };

  return (
    <div
      className={
        'prop-row prop-row--dimension' +
        (anyDirty ? ' prop-row--dirty' : '') +
        (sides.every((s) => !s.dirty && s.value == null) ? ' prop-row--unset' : '')
      }
    >
      <div className="prop-row__key prop-row__key--with-icon">
        <Icon name={iconName} />
        <span>{groupLabel}</span>
        {anyDirty && <span className="prop-row__dirty-dot" title="unsaved change" />}
      </div>
      <div className="prop-row__control prop-row__control--dimension">
        <button
          type="button"
          className={'dim-grid__lock' + (linked ? ' dim-grid__lock--on' : '')}
          onClick={toggleLock}
          title={
            linked
              ? 'Linked — edits affect every side'
              : 'Independent — edits affect only the changed side'
          }
          aria-pressed={linked}
        >
          <Icon name={linked ? 'link' : 'unlink'} />
        </button>
        <div className="dim-grid__cells">
          {sides.map((side) => (
            <DimensionCell
              key={side.key}
              side={side}
              onChange={(v) => handleCellChange(side.key, v)}
            />
          ))}
        </div>
        {anyDirty && onRevertAll && (
          <button
            type="button"
            className="prop-row__btn"
            title="Revert all sides"
            onClick={onRevertAll}
          >
            ↺
          </button>
        )}
      </div>
    </div>
  );
}

function DimensionCell({
  side,
  onChange,
}: {
  side: DimensionSide;
  onChange: (v: unknown) => void;
}) {
  const { draft, setDraft, commit } = useDraftCommit(
    side.value,
    toText,
    (s) => (s === '' ? undefined : Number(s)),
    onChange,
  );
  return (
    <label
      className={'dim-grid__cell' + (side.dirty ? ' dim-grid__cell--dirty' : '')}
      title={side.key}
    >
      <span className="dim-grid__label">{side.label}</span>
      <input
        type="number"
        className="prop-input prop-input--micro"
        value={draft}
        min={0}
        disabled={side.disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
