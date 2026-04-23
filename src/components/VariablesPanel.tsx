import { useEffect, useMemo, useState } from 'react';
import type { EsphomeProject } from '../parser/types';
import { useEditorStore } from '../editor/store';
import { isColorLike, toHexColor, toLvglHex } from '../editor/colors';

interface Props {
  project: EsphomeProject;
}

/**
 * List ESPHome `substitutions:` defined in the project with per-var editable
 * value, usage count, and "jump to first usage" action. Edits are staged in
 * `varOverrides` on the editor store and flushed by the top-level Save flow.
 */
export function VariablesPanel({ project }: Props) {
  const substitutions = project.substitutions ?? {};
  const setSelected = useEditorStore((s) => s.setSelected);
  const varOverrides = useEditorStore((s) => s.varOverrides);
  const updateVar = useEditorStore((s) => s.updateVar);
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
        {entries.map(([name, entry]) => {
          const hasOverride = name in varOverrides;
          const value = hasOverride ? varOverrides[name] : entry.value;
          return (
            <VarRow
              key={name}
              name={name}
              value={value}
              originalValue={entry.value}
              usageCount={entry.usages.length}
              fileHint={shortFile(entry.file)}
              hasOverride={hasOverride}
              onChange={(v) => updateVar(name, v === entry.value ? undefined : v)}
              onRevert={() => updateVar(name, undefined)}
              onJump={entry.usages.length > 0 ? () => setSelected(entry.usages[0].widgetId) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

function VarRow({
  name,
  value,
  usageCount,
  fileHint,
  hasOverride,
  onChange,
  onRevert,
  onJump,
}: {
  name: string;
  value: string;
  originalValue: string;
  usageCount: number;
  fileHint: string;
  hasOverride: boolean;
  onChange: (v: string) => void;
  onRevert: () => void;
  onJump?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const isColor = isColorLike(value) || isColorLike(draft);
  const hex = isColor ? toHexColor(draft) : null;

  return (
    <div className={`var-row ${hasOverride ? 'var-row--dirty' : ''}`}>
      <div className="var-row__name">
        ${'{'}{name}{'}'}
        {hasOverride && <span className="prop-row__dirty-dot" title="unsaved change" />}
      </div>
      <div className="var-row__control">
        {isColor && (
          <input
            type="color"
            className="prop-input__color-picker"
            value={hex ?? '#000000'}
            onChange={(e) => {
              const next = toLvglHex(e.target.value);
              setDraft(next);
              onChange(next);
            }}
          />
        )}
        <input
          type="text"
          className="prop-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== value) onChange(draft); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
        />
        {hasOverride && (
          <button type="button" className="prop-row__revert" title="Revert to source" onClick={onRevert}>
            ↺
          </button>
        )}
      </div>
      <div className="var-row__meta">
        <span className="var-row__count" title={`Defined in ${fileHint}`}>
          {usageCount} use{usageCount === 1 ? '' : 's'}
        </span>
        {onJump && (
          <button type="button" className="var-row__jump" onClick={onJump}>
            jump →
          </button>
        )}
      </div>
    </div>
  );
}

function shortFile(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}
