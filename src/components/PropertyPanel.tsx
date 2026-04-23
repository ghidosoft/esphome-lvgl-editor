import type { EsphomeProject, LvglWidget, PropSource, WidgetId } from '../parser/types';
import { isOpaqueTag } from '../parser/types';
import { useEditorStore } from '../editor/store';
import { getSchema, type SchemaEntry } from '../editor/schema';
import { PropControl } from './PropControl';

interface Props {
  project: EsphomeProject;
}

/**
 * Property editor for the selected widget. Schema-covered props render as
 * editable controls; unknown props appear as read-only raw rows. Var-backed
 * and mixed-template props are shown but disabled in P3 (P4 will wire them
 * to the substitution definition).
 */
export function PropertyPanel({ project }: Props) {
  const selectedWidgetId = useEditorStore((s) => s.selectedWidgetId);
  const overrides = useEditorStore((s) => s.overrides);
  const updateProp = useEditorStore((s) => s.updateProp);

  if (!selectedWidgetId) {
    return <div className="panel__hint">Click a widget on the canvas to inspect it.</div>;
  }
  const widget = findWidget(project, selectedWidgetId);
  const sources = project.sources?.[selectedWidgetId];
  if (!widget || !sources) {
    return <div className="panel__hint">Widget not found on the current page.</div>;
  }

  const schema = getSchema(widget.type);
  const widgetOverrides = overrides[selectedWidgetId] ?? {};

  // Props covered by the schema render with controls, in schema order. Only
  // show rows for props that are either present on the widget (in source or
  // via override) OR have a PropSource (defined in YAML somewhere upstream).
  const schemaRows = schema.filter(
    (entry) =>
      entry.key in widget.props || entry.key in widgetOverrides || !!sources.props[entry.key],
  );
  // Remaining props fall through as read-only raw rows.
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

        {schemaRows.map((entry) => (
          <EditableRow
            key={entry.key}
            entry={entry}
            widget={widget}
            widgetId={selectedWidgetId}
            source={sources.props[entry.key]}
            project={project}
            override={widgetOverrides[entry.key]}
            hasOverride={entry.key in widgetOverrides}
            onChange={(v) => updateProp(selectedWidgetId, entry.key, v)}
            onRevert={() => updateProp(selectedWidgetId, entry.key, undefined)}
          />
        ))}

        {extraRows.map((key) => (
          <ReadOnlyRow
            key={key}
            label={key}
            value={formatValue(widget.props[key])}
            opaque={isOpaqueTag(widget.props[key]) ? (widget.props[key] as { __tag: string }).__tag : undefined}
            source={sources.props[key]}
          />
        ))}

        {schemaRows.length === 0 && extraRows.length === 0 && widget.styles.length === 0 && (
          <div className="panel__hint">No properties on this widget.</div>
        )}
      </div>
    </div>
  );
}

function EditableRow({
  entry,
  widget,
  source,
  project,
  override,
  hasOverride,
  onChange,
  onRevert,
}: {
  entry: SchemaEntry;
  widget: LvglWidget;
  widgetId: WidgetId;
  source?: PropSource;
  project: EsphomeProject;
  override: unknown;
  hasOverride: boolean;
  onChange: (v: unknown) => void;
  onRevert: () => void;
}) {
  const raw = hasOverride ? override : widget.props[entry.key];
  const disabled = !!source?.viaVariable || !!source?.template;
  const sub = source?.viaVariable ? project.substitutions?.[source.viaVariable] : undefined;
  const rowClass = `prop-row ${hasOverride ? 'prop-row--dirty' : ''} ${disabled ? 'prop-row--disabled' : ''}`;

  return (
    <div className={rowClass}>
      <div className="prop-row__key">
        {entry.key}
        {hasOverride && <span className="prop-row__dirty-dot" title="unsaved change" />}
      </div>
      <div className="prop-row__control">
        <PropControl entry={entry} value={raw} onChange={onChange} disabled={disabled} />
        {hasOverride && (
          <button type="button" className="prop-row__revert" title="Revert to source" onClick={onRevert}>
            ↺
          </button>
        )}
      </div>
      {source?.viaVariable && (
        <div className="prop-row__banner">
          Bound to <code>${'{'}{source.viaVariable}{'}'}</code>
          {sub && <> · used by {sub.usages.length} widget{sub.usages.length === 1 ? '' : 's'}</>}
          · editing variables is P4
        </div>
      )}
      {source?.template && (
        <div className="prop-row__banner">Mixed template — editing is P4</div>
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
