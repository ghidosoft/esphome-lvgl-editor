import { useMemo, useState } from 'react';
import type { EsphomeProject } from '../parser/types';
import { useEditorStore } from '../editor/store';

interface Props {
  project: EsphomeProject;
}

/**
 * Read-only list of ESPHome `substitutions:` detected in the project, with
 * the number of widgets each variable is bound to and a "jump to first usage"
 * action. Editing variable values is P4.
 */
export function VariablesPanel({ project }: Props) {
  const substitutions = project.substitutions ?? {};
  const setSelected = useEditorStore((s) => s.setSelected);
  const [filter, setFilter] = useState('');

  const entries = useMemo(() => {
    const all = Object.entries(substitutions);
    const q = filter.trim().toLowerCase();
    const filtered = q ? all.filter(([k]) => k.toLowerCase().includes(q)) : all;
    return filtered.sort(([a], [b]) => a.localeCompare(b));
  }, [substitutions, filter]);

  if (Object.keys(substitutions).length === 0) {
    return <div className="panel__hint">No substitutions defined.</div>;
  }

  return (
    <div className="panel-body">
      <div className="vars-filter">
        <input
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="panel-body__rows">
        {entries.map(([name, entry]) => (
          <div key={name} className="var-row">
            <div className="var-row__name">${'{'}{name}{'}'}</div>
            <div className="var-row__value">{entry.value}</div>
            <div className="var-row__meta">
              <span className="var-row__count" title={`Defined in ${shortFile(entry.file)}`}>
                {entry.usages.length} use{entry.usages.length === 1 ? '' : 's'}
              </span>
              {entry.usages.length > 0 && (
                <button
                  type="button"
                  className="var-row__jump"
                  onClick={() => setSelected(entry.usages[0].widgetId)}
                >
                  jump →
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function shortFile(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}
