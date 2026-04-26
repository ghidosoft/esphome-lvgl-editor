import type { ReactNode } from 'react';

export interface VarBinding {
  name: string;
  usages?: number;
}

interface Props {
  label: string;
  dirty?: boolean;
  unset?: boolean;
  pendingDelete?: boolean;
  disabled?: boolean;
  /** Var binding info → renders the "bound to ${var}" banner. */
  varBinding?: VarBinding;
  /** When true, renders the "mixed template — editing not supported" banner. */
  template?: boolean;
  /** Origin file path → renders the small "from <file>" line. */
  origin?: string;
  canRevert?: boolean;
  canDelete?: boolean;
  onRevert?: () => void;
  onDelete?: () => void;
  /** The actual control (input, select, etc.). */
  children: ReactNode;
}

/**
 * Chrome of an editable property row: label + dirty/unset markers, the control,
 * the revert/delete actions, and the optional contextual banners. Decoupled
 * from any specific control so any field component can slot in as a child.
 */
export function PropertyRow({
  label,
  dirty,
  unset,
  pendingDelete,
  disabled,
  varBinding,
  template,
  origin,
  canRevert,
  canDelete,
  onRevert,
  onDelete,
  children,
}: Props) {
  const rowClass = [
    'prop-row',
    dirty ? 'prop-row--dirty' : '',
    disabled ? 'prop-row--disabled' : '',
    pendingDelete ? 'prop-row--pending-delete' : '',
    unset ? 'prop-row--unset' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClass}>
      <div className="prop-row__key">
        {label}
        {dirty && <span className="prop-row__dirty-dot" title="unsaved change" />}
        {unset && <span className="prop-row__unset-tag">unset</span>}
      </div>
      <div className="prop-row__control">
        {children}
        {canRevert && (
          <button
            type="button"
            className="prop-row__btn"
            title="Revert to source"
            onClick={onRevert}
          >
            ↺
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            className="prop-row__btn prop-row__btn--danger"
            title="Remove from YAML (revert to LVGL default)"
            onClick={onDelete}
          >
            ×
          </button>
        )}
      </div>
      {pendingDelete && (
        <div className="prop-row__banner prop-row__banner--warn">
          Pending removal — will be deleted from YAML on save
        </div>
      )}
      {varBinding && !pendingDelete && (
        <div className="prop-row__banner prop-row__banner--var">
          Bound to{' '}
          <code>
            ${'{'}
            {varBinding.name}
            {'}'}
          </code>
          {varBinding.usages != null && (
            <>
              {' · '}edit affects {varBinding.usages} place
              {varBinding.usages === 1 ? '' : 's'}
            </>
          )}
        </div>
      )}
      {template && (
        <div className="prop-row__banner">Mixed template — editing not supported yet.</div>
      )}
      {origin && <OriginLine label="from" file={origin} />}
    </div>
  );
}

function OriginLine({ label, file }: { label: string; file: string }) {
  if (!file) return null;
  return (
    <div className="prop-row__origin">
      {label} <code>{shortFile(file)}</code>
    </div>
  );
}

function shortFile(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}
