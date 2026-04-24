import { useMemo, useState } from 'react';
import type { EsphomeProject, PropSource } from '../parser/types';
import { isOpaqueTag } from '../parser/types';
import { useEditorStore } from '../editor/store';
import { getSchema, type SchemaEntry } from '../editor/schema';
import { PropControl } from './PropControl';

interface Props {
  project: EsphomeProject;
}

/**
 * Editor for `style_definitions:` entries. Each style renders as a collapsible
 * section; expanding one shows the schema-driven controls (same widget-obj
 * common schema: colors, geometry, padding). Var-backed props route to
 * `varOverrides` as elsewhere; deletions and new-key writes reuse the
 * widget-side wiring.
 */
export function StylesPanel({ project }: Props) {
  const styles = useMemo(() => project.styles ?? {}, [project.styles]);
  const styleSources = project.styleSources ?? {};
  const styleOverridesMap = useEditorStore((s) => s.styleOverrides);
  const styleDeletionsMap = useEditorStore((s) => s.styleDeletions);
  const varOverrides = useEditorStore((s) => s.varOverrides);
  const updateStyleProp = useEditorStore((s) => s.updateStyleProp);
  const deleteStyleProp = useEditorStore((s) => s.deleteStyleProp);
  const [filter, setFilter] = useState('');

  const entries = useMemo(() => {
    const all = Object.keys(styles);
    const q = filter.trim().toLowerCase();
    const filtered = q ? all.filter((k) => k.toLowerCase().includes(q)) : all;
    return filtered.sort((a, b) => a.localeCompare(b));
  }, [styles, filter]);

  if (entries.length === 0) {
    return <div className="panel__hint">No styles defined.</div>;
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
        {entries.map((styleId) => {
          const style = styles[styleId];
          const sources = styleSources[styleId];
          const ov = styleOverridesMap[styleId] ?? {};
          const del = styleDeletionsMap[styleId] ?? [];
          const dirty = Object.keys(ov).length + del.length > 0;
          return (
            <StyleSection
              key={styleId}
              styleId={styleId}
              props={style.props}
              sources={sources}
              varOverrides={varOverrides}
              overrides={ov}
              pendingDeletions={del}
              dirty={dirty}
              onChange={(k, v) => updateStyleProp(project, styleId, k, v)}
              onRevert={(k) => updateStyleProp(project, styleId, k, undefined)}
              onDelete={(k) => deleteStyleProp(styleId, k)}
              project={project}
            />
          );
        })}
      </div>
    </div>
  );
}

function StyleSection({
  styleId,
  props,
  sources,
  varOverrides,
  overrides,
  pendingDeletions,
  dirty,
  onChange,
  onRevert,
  onDelete,
  project,
}: {
  styleId: string;
  props: Record<string, unknown>;
  sources?: {
    self: { file: string; yamlPath: (string | number)[] };
    props: Record<string, PropSource>;
  };
  varOverrides: Record<string, string>;
  overrides: Record<string, unknown>;
  pendingDeletions: string[];
  dirty: boolean;
  onChange: (key: string, value: unknown) => void;
  onRevert: (key: string) => void;
  onDelete: (key: string) => void;
  project: EsphomeProject;
}) {
  // Schema is the obj common schema — styles can hold any of those props.
  const schema = getSchema('obj');
  const schemaKeys = new Set(schema.map((e) => e.key));
  const extraKeys = Object.keys(props).filter((k) => !schemaKeys.has(k));

  return (
    <details className={`style-section ${dirty ? 'style-section--dirty' : ''}`}>
      <summary className="style-section__header">
        <span className="style-section__name">{styleId}</span>
        {dirty && <span className="prop-row__dirty-dot" title="unsaved change" />}
        {sources && <span className="style-section__file">{shortFile(sources.self.file)}</span>}
      </summary>
      <div className="style-section__body">
        {schema.map((entry) => {
          const source = sources?.props[entry.key];
          const varName = source?.viaVariable;
          const varOverride = varName ? varOverrides[varName] : undefined;
          const hasVarOverride = varName != null && varName in varOverrides;
          const hasStyleOverride = entry.key in overrides;
          const pendingDelete = pendingDeletions.includes(entry.key);
          const hasOverride = hasVarOverride || hasStyleOverride || pendingDelete;
          const existsInSource = source != null;
          const existsNow = entry.key in props;
          const effective = hasVarOverride
            ? varOverride
            : hasStyleOverride
              ? overrides[entry.key]
              : props[entry.key];
          const isVarBacked = !!source?.viaVariable;
          const canDelete = existsInSource && !isVarBacked && !source?.template;
          const disabled = !!source?.template || pendingDelete;

          const rowClass = [
            'prop-row',
            hasOverride ? 'prop-row--dirty' : '',
            disabled ? 'prop-row--disabled' : '',
            pendingDelete ? 'prop-row--pending-delete' : '',
            !existsNow && !hasOverride ? 'prop-row--unset' : '',
          ]
            .join(' ')
            .trim();

          return (
            <div key={entry.key} className={rowClass}>
              <div className="prop-row__key">
                {entry.key}
                {hasOverride && <span className="prop-row__dirty-dot" title="unsaved change" />}
                {!existsNow && !hasOverride && <span className="prop-row__unset-tag">unset</span>}
              </div>
              <div className="prop-row__control">
                <PropControl
                  entry={entry as SchemaEntry}
                  value={effective}
                  onChange={(v) => onChange(entry.key, v)}
                  disabled={disabled}
                />
                {hasOverride && (
                  <button
                    type="button"
                    className="prop-row__btn"
                    title="Revert to source"
                    onClick={() => onRevert(entry.key)}
                  >
                    ↺
                  </button>
                )}
                {canDelete && !pendingDelete && (
                  <button
                    type="button"
                    className="prop-row__btn prop-row__btn--danger"
                    title="Remove from YAML"
                    onClick={() => onDelete(entry.key)}
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
              {source?.viaVariable && !pendingDelete && (
                <div className="prop-row__banner prop-row__banner--var">
                  Bound to{' '}
                  <code>
                    ${'{'}
                    {source.viaVariable}
                    {'}'}
                  </code>
                  {project.substitutions?.[source.viaVariable] && (
                    <>
                      {' · '}edit affects {project.substitutions[source.viaVariable].usages.length}{' '}
                      place
                      {project.substitutions[source.viaVariable].usages.length === 1 ? '' : 's'}
                    </>
                  )}
                </div>
              )}
              {source?.template && (
                <div className="prop-row__banner">Mixed template — editing not supported yet.</div>
              )}
            </div>
          );
        })}
        {extraKeys.length > 0 && (
          <div className="style-section__extras">
            <div className="style-section__extras-title">Other keys (read-only)</div>
            {extraKeys.map((k) => {
              const v = props[k];
              return (
                <div key={k} className="prop-row prop-row--readonly">
                  <div className="prop-row__key">{k}</div>
                  <div className="prop-row__value">
                    {isOpaqueTag(v) ? (
                      <span className="prop-row__opaque">{v.__tag}</span>
                    ) : (
                      <span>{formatValue(v)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}

function shortFile(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}

function formatValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (isOpaqueTag(v)) return v.value;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
