import type { ParseError } from '../parser/types';

interface ErrorPanelProps {
  errors: ParseError[];
}

/**
 * Right-hand panel listing non-fatal parser warnings (skipped widgets,
 * missing substitutions, unreadable includes). Hidden when empty.
 */
export function ErrorPanel({ errors }: ErrorPanelProps) {
  if (errors.length === 0) return null;
  // Group by kind for readability
  const groups = new Map<string, ParseError[]>();
  for (const e of errors) {
    const list = groups.get(e.kind) ?? [];
    list.push(e);
    groups.set(e.kind, list);
  }

  return (
    <aside className="error-panel">
      <h2 className="error-panel__title">Warnings ({errors.length})</h2>
      {[...groups.entries()].map(([kind, items]) => (
        <section key={kind} className="error-panel__group">
          <h3>{kind}</h3>
          <ul>
            {items.map((e, i) => (
              <li key={`${kind}-${i}`}>
                <span className="error-panel__msg">{e.message}</span>
                {'path' in e && e.path && <small> @ {shortPath(e.path)}</small>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-3).join('/');
}
