import type { EsphomeProject, LvglWidget, PropSource, WidgetId } from '../parser/types';
import { isOpaqueTag } from '../parser/types';
import { useEditorStore } from '../editor/store';
import { getSchema, type SchemaEntry } from '../editor/schema';
import { PropControl } from './PropControl';

interface Props {
  project: EsphomeProject;
}

/**
 * Property editor for the selected widget. Renders every entry from the
 * widget's schema — including ones not yet defined in YAML — so the user can
 * both tweak existing props and add new ones. Schema-covered props use typed
 * controls; unknown props fall through as read-only raw rows. Var-backed
 * props are editable (changes flow to the substitution); templates stay
 * read-only.
 *
 * Each editable row has a revert button (↺) when dirty, and a remove button
 * (×) when the prop is currently defined in the source — removing drops the
 * key from YAML on save, reverting the widget to the LVGL default.
 */
export function PropertyPanel({ project }: Props) {
  const selectedWidgetId = useEditorStore((s) => s.selectedWidgetId);
  const widgetOverridesMap = useEditorStore((s) => s.widgetOverrides);
  const varOverrides = useEditorStore((s) => s.varOverrides);
  const widgetDeletionsMap = useEditorStore((s) => s.widgetDeletions);
  const updateProp = useEditorStore((s) => s.updateProp);
  const deleteProp = useEditorStore((s) => s.deleteProp);

  if (!selectedWidgetId) {
    return <div className="panel__hint">Click a widget on the canvas to inspect it.</div>;
  }
  const widget = findWidget(project, selectedWidgetId);
  const sources = project.sources?.[selectedWidgetId];
  if (!widget || !sources) {
    return <div className="panel__hint">Widget not found on the current page.</div>;
  }

  const schema = getSchema(widget.type);
  const widgetOverrides = widgetOverridesMap[selectedWidgetId] ?? {};
  const pendingDeletions = widgetDeletionsMap[selectedWidgetId] ?? [];

  // Props outside the schema that are present on the widget — render
  // read-only so nothing gets hidden. (Editing the full surface is a P5
  // schema-expansion concern.)
  const schemaKeys = new Set(schema.map((e) => e.key));
  const extraRows = Object.keys(widget.props).filter((k) => !schemaKeys.has(k));

  return (
    <div className="panel-body">
      <header className="panel-body__header">
        <div className="panel-body__type">{widget.type}</div>
        <div className="panel-body__id">{selectedWidgetId}</div>
        {sources.self && <OriginLine label="defined in" file={sources.self.file} />}
      </header>

      <div className="panel-body__rows">
        {widget.styles.length > 0 && (
          <ReadOnlyRow
            label="styles"
            value={widget.styles.join(', ')}
            source={sources.styles}
          />
        )}

        {schema.map((entry) => {
          const source = sources.props[entry.key];
          const varName = source?.viaVariable;
          const varOverride = varName ? varOverrides[varName] : undefined;
          const hasVarOverride = varName != null && varName in varOverrides;
          const hasWidgetOverride = entry.key in widgetOverrides;
          const pendingDelete = pendingDeletions.includes(entry.key);
          const hasOverride = hasVarOverride || hasWidgetOverride || pendingDelete;
          const existsInSource = source != null;
          const existsNow = entry.key in widget.props;

          // Effective displayed value: varOverride → widgetOverride → source.
          // When pending-delete, show the control with source value but dimmed.
          const effective = hasVarOverride
            ? varOverride
            : hasWidgetOverride
              ? widgetOverrides[entry.key]
              : widget.props[entry.key];

          return (
            <EditableRow
              key={entry.key}
              entry={entry}
              source={source}
              project={project}
              value={effective}
              hasOverride={hasOverride}
              pendingDelete={pendingDelete}
              existsInSource={existsInSource}
              existsNow={existsNow}
              onChange={(v) => updateProp(project, selectedWidgetId, entry.key, v)}
              onRevert={() => updateProp(project, selectedWidgetId, entry.key, undefined)}
              onDelete={() => deleteProp(selectedWidgetId, entry.key)}
            />
          );
        })}

        {extraRows.map((key) => (
          <ReadOnlyRow
            key={key}
            label={key}
            value={formatValue(widget.props[key])}
            opaque={isOpaqueTag(widget.props[key]) ? (widget.props[key] as { __tag: string }).__tag : undefined}
            source={sources.props[key]}
          />
        ))}
      </div>
    </div>
  );
}

function EditableRow({
  entry,
  source,
  project,
  value,
  hasOverride,
  pendingDelete,
  existsInSource,
  existsNow,
  onChange,
  onRevert,
  onDelete,
}: {
  entry: SchemaEntry;
  source?: PropSource;
  project: EsphomeProject;
  value: unknown;
  hasOverride: boolean;
  pendingDelete: boolean;
  existsInSource: boolean;
  existsNow: boolean;
  onChange: (v: unknown) => void;
  onRevert: () => void;
  onDelete: () => void;
}) {
  const disabled = !!source?.template || pendingDelete;
  const sub = source?.viaVariable ? project.substitutions?.[source.viaVariable] : undefined;
  const isVarBacked = !!source?.viaVariable;
  // Offer "remove" only for literal props that actually exist in the source;
  // var-backed removal would mean detach (P5), and adding+deleting a not-yet-
  // written prop is just a revert.
  const canDelete = existsInSource && !isVarBacked && !source?.template;

  const rowClass = [
    'prop-row',
    hasOverride ? 'prop-row--dirty' : '',
    disabled ? 'prop-row--disabled' : '',
    pendingDelete ? 'prop-row--pending-delete' : '',
    !existsNow && !hasOverride ? 'prop-row--unset' : '',
  ].join(' ').trim();

  return (
    <div className={rowClass}>
      <div className="prop-row__key">
        {entry.key}
        {hasOverride && <span className="prop-row__dirty-dot" title="unsaved change" />}
        {!existsNow && !hasOverride && <span className="prop-row__unset-tag">unset</span>}
      </div>
      <div className="prop-row__control">
        <PropControl entry={entry} value={value} onChange={onChange} disabled={disabled} />
        {hasOverride && (
          <button type="button" className="prop-row__btn" title="Revert to source" onClick={onRevert}>
            ↺
          </button>
        )}
        {canDelete && !pendingDelete && (
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
      {source?.viaVariable && !pendingDelete && (
        <div className="prop-row__banner prop-row__banner--var">
          Bound to <code>${'{'}{source.viaVariable}{'}'}</code>
          {sub && (
            <>
              {' · '}edit affects {sub.usages.length} place{sub.usages.length === 1 ? '' : 's'}
            </>
          )}
        </div>
      )}
      {source?.template && (
        <div className="prop-row__banner">Mixed template — editing not supported yet.</div>
      )}
      {source && <OriginLine label="from" file={source.file} />}
    </div>
  );
}

function ReadOnlyRow({
  label,
  value,
  source,
  opaque,
}: {
  label: string;
  value: string;
  source?: PropSource;
  opaque?: string;
}) {
  return (
    <div className="prop-row prop-row--readonly">
      <div className="prop-row__key">{label}</div>
      <div className="prop-row__value">
        {opaque ? <span className="prop-row__opaque">{opaque}</span> : <span>{value}</span>}
      </div>
      {source && <OriginLine label="from" file={source.file} />}
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

function findWidget(project: EsphomeProject, id: WidgetId): LvglWidget | null {
  for (const page of project.pages) {
    const hit = walk(page.widgets, id);
    if (hit) return hit;
  }
  return null;
}

function walk(widgets: LvglWidget[], id: WidgetId): LvglWidget | null {
  for (const w of widgets) {
    if (w.widgetId === id) return w;
    const hit = walk(w.children, id);
    if (hit) return hit;
  }
  return null;
}
