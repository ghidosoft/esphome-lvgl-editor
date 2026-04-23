import type { EsphomeProject, LvglWidget, PropSource, WidgetId } from '../parser/types';
import { isOpaqueTag } from '../parser/types';
import { useEditorStore } from '../editor/store';

interface Props {
  project: EsphomeProject;
}

/**
 * Read-only view of the selected widget's properties with origin badges.
 * P2 goal: surface which file every value comes from and which ones are
 * `${var}`-backed, so the user can verify the source map is correct before
 * any edits land in P3.
 */
export function PropertyPanel({ project }: Props) {
  const selectedWidgetId = useEditorStore((s) => s.selectedWidgetId);

  if (!selectedWidgetId) {
    return <div className="panel__hint">Click a widget on the canvas to inspect it.</div>;
  }
  const widget = findWidget(project, selectedWidgetId);
  const sources = project.sources?.[selectedWidgetId];
  if (!widget || !sources) {
    return <div className="panel__hint">Widget not found on the current page.</div>;
  }

  const propEntries = Object.entries(widget.props);

  return (
    <div className="panel-body">
      <header className="panel-body__header">
        <div className="panel-body__type">{widget.type}</div>
        <div className="panel-body__id">{selectedWidgetId}</div>
        {sources.self && <OriginLine label="defined in" file={sources.self.file} />}
      </header>
      <div className="panel-body__rows">
        {widget.styles.length > 0 && (
          <Row label="styles" value={widget.styles.join(', ')} source={sources.styles} project={project} />
        )}
        {propEntries.length === 0 && widget.styles.length === 0 && (
          <div className="panel__hint">No properties on this widget.</div>
        )}
        {propEntries.map(([key, value]) => (
          <Row
            key={key}
            label={key}
            value={formatValue(value)}
            source={sources.props[key]}
            opaque={isOpaqueTag(value) ? value.__tag : undefined}
            project={project}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  source,
  opaque,
  project,
}: {
  label: string;
  value: string;
  source?: PropSource;
  opaque?: string;
  project: EsphomeProject;
}) {
  const sub = source?.viaVariable ? project.substitutions?.[source.viaVariable] : undefined;
  return (
    <div className="prop-row">
      <div className="prop-row__key">{label}</div>
      <div className="prop-row__value">
        {opaque ? (
          <span className="prop-row__opaque">{opaque}</span>
        ) : (
          <span>{value}</span>
        )}
        {source?.viaVariable && (
          <span className="prop-row__var" title={sub ? `Used by ${sub.usages.length} widget(s)` : undefined}>
            ${'{'}{source.viaVariable}{'}'}
          </span>
        )}
        {source?.template && <span className="prop-row__tag">template</span>}
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
