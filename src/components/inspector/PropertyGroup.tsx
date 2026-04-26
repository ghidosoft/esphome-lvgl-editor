import { useState, type ReactNode } from 'react';

interface Props {
  label: string;
  /** Number of dirty rows inside; surfaced as a chip when collapsed. */
  modifiedCount?: number;
  defaultOpen?: boolean;
  /** Forces the group open regardless of stored/local state (used by search). */
  forceOpen?: boolean;
  /** localStorage key suffix; persists open/close across reloads when set. */
  persistKey?: string;
  /** Optional badge slot (e.g. the "S" pill for state-aware sections). */
  badge?: ReactNode;
  children: ReactNode;
}

const STORAGE_PREFIX = 'inspector.section.';

/**
 * Collapsible group container. Open-state is persisted to localStorage when a
 * `persistKey` is provided so reloads keep the user's last layout. `forceOpen`
 * bypasses the stored state without overwriting it — used by search filtering
 * to expand any section that contains a match, then collapse back when the
 * query clears.
 */
export function PropertyGroup({
  label,
  modifiedCount,
  defaultOpen = true,
  forceOpen,
  persistKey,
  badge,
  children,
}: Props) {
  const [storedOpen, setStoredOpen] = useState<boolean>(() => {
    if (!persistKey) return defaultOpen;
    try {
      const v = localStorage.getItem(STORAGE_PREFIX + persistKey);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch {
      // localStorage may throw in private mode / sandboxed contexts.
    }
    return defaultOpen;
  });
  const open = forceOpen || storedOpen;

  const toggle = () => {
    const next = !storedOpen;
    setStoredOpen(next);
    if (persistKey) {
      try {
        localStorage.setItem(STORAGE_PREFIX + persistKey, next ? '1' : '0');
      } catch {
        // ignore
      }
    }
  };

  const showCount = !open && modifiedCount != null && modifiedCount > 0;

  return (
    <div className={`prop-group${open ? '' : ' prop-group--collapsed'}`}>
      <button type="button" className="prop-group__header" onClick={toggle} aria-expanded={open}>
        <span className="prop-group__caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="prop-group__title">{label}</span>
        {badge}
        {showCount && (
          <span className="prop-group__count" title={`${modifiedCount} modified`}>
            {modifiedCount}
          </span>
        )}
      </button>
      {open && <div className="prop-group__rows">{children}</div>}
    </div>
  );
}
