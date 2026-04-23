import { useState } from 'react';
import type { ParseError } from '../parser/types';

interface Props {
  errors: ParseError[];
}

/**
 * Bottom drawer replacing the old right-column ErrorPanel: lists non-fatal
 * parser warnings (skipped widgets, missing substitutions, unreadable
 * includes). Collapsed by default when there are warnings; the header chip
 * stays visible so the count is always in sight.
 */
export function ErrorDrawer({ errors }: Props) {
  const [open, setOpen] = useState(false);
  if (errors.length === 0) {
    return (
      <footer className="error-drawer error-drawer--empty">
        <span className="error-drawer__ok">No warnings</span>
      </footer>
    );
  }

  const groups = new Map<string, ParseError[]>();
  for (const e of errors) {
    const list = groups.get(e.kind) ?? [];
    list.push(e);
    groups.set(e.kind, list);
  }

  return (
    <footer className={`error-drawer ${open ? 'error-drawer--open' : ''}`}>
      <button
        type="button"
        className="error-drawer__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="error-drawer__chevron">{open ? '▾' : '▸'}</span>
        <span className="error-drawer__title">Warnings</span>
        <span className="error-drawer__count">{errors.length}</span>
      </button>
      {open && (
        <div className="error-drawer__body">
          {[...groups.entries()].map(([kind, items]) => (
            <section key={kind} className="error-drawer__group">
              <h3>{kind}</h3>
              <ul>
                {items.map((e, i) => (
                  <li key={`${kind}-${i}`}>
                    <span className="error-drawer__msg">{e.message}</span>
                    {'path' in e && e.path && <small> @ {shortPath(e.path)}</small>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </footer>
  );
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-3).join('/');
}
