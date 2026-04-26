import type { ReactNode } from 'react';
import type { EsphomeProject, LvglWidget, WidgetId } from '../parser/types';
import { isOpaqueTag } from '../parser/types';
import { useEditorStore } from '../editor/store';
import { getSchema, isGroup, type SchemaEntry, type SchemaItem } from '../editor/schema';
import { getNested, splitKey } from '../editor/nestedKey';
import { PropControl } from './PropControl';
import { StylesField } from './StylesField';
import { Breadcrumb } from './Breadcrumb';
import { StateToggleStrip } from './StateToggleStrip';
import { PropertyRow } from './inspector/PropertyRow';
import { PropertyGroup } from './inspector/PropertyGroup';
import { ReadOnlyRow } from './inspector/ReadOnlyRow';

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
  const activeState = useEditorStore((s) => s.activeState);
  const setActiveState = useEditorStore((s) => s.setActiveState);

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
  // read-only so nothing gets hidden. Schema groups claim their top-level
  // YAML key (e.g. `indicator`) so they don't reappear as raw rows.
  const schemaKeys = new Set(schema.map((e) => e.key));
  const extraRows = Object.keys(widget.props).filter((k) => !schemaKeys.has(k));

  const renderRow = (entry: SchemaEntry): ReactNode => {
    const source = sources.props[entry.key];
    const varName = source?.viaVariable;
    const varOverride = varName ? varOverrides[varName] : undefined;
    const hasVarOverride = varName != null && varName in varOverrides;
    const hasWidgetOverride = entry.key in widgetOverrides;
    const pendingDelete = pendingDeletions.includes(entry.key);
    const hasOverride = hasVarOverride || hasWidgetOverride || pendingDelete;
    const existsInSource = source != null;
    const path = splitKey(entry.key);
    const existsNow = getNested(widget.props, path) !== undefined;

    // Effective displayed value: varOverride → widgetOverride → source.
    const effective = hasVarOverride
      ? varOverride
      : hasWidgetOverride
        ? widgetOverrides[entry.key]
        : getNested(widget.props, path);

    const disabled = !!source?.template || pendingDelete;
    const isVarBacked = !!source?.viaVariable;
    // Offer "remove" only for literal props that actually exist in the source;
    // var-backed removal would mean detach (P5), and adding+deleting a not-yet-
    // written prop is just a revert.
    const canDelete = existsInSource && !isVarBacked && !source?.template;
    const sub = source?.viaVariable ? project.substitutions?.[source.viaVariable] : undefined;

    return (
      <PropertyRow
        key={entry.key}
        label={entry.key}
        dirty={hasOverride}
        unset={!existsNow && !hasOverride}
        pendingDelete={pendingDelete}
        disabled={disabled}
        varBinding={
          source?.viaVariable ? { name: source.viaVariable, usages: sub?.usages.length } : undefined
        }
        template={!!source?.template}
        origin={source?.file}
        canRevert={hasOverride}
        canDelete={canDelete && !pendingDelete}
        onRevert={() => updateProp(project, selectedWidgetId, entry.key, undefined)}
        onDelete={() => deleteProp(selectedWidgetId, entry.key)}
      >
        <PropControl
          entry={entry}
          value={effective}
          onChange={(v) => updateProp(project, selectedWidgetId, entry.key, v)}
          disabled={disabled}
        />
      </PropertyRow>
    );
  };

  return (
    <div className="panel-body">
      <header className="panel-body__header">
        <Breadcrumb project={project} widgetId={selectedWidgetId} />
        <div className="panel-body__type">{widget.type}</div>
        <div className="panel-body__id">{selectedWidgetId}</div>
        {sources.self && (
          <div className="prop-row__origin">
            defined in <code>{shortFile(sources.self.file)}</code>
          </div>
        )}
        <StateToggleStrip widget={widget} activeState={activeState} onChange={setActiveState} />
      </header>

      <div className="panel-body__rows">
        <StylesField
          currentStyles={
            'styles' in widgetOverrides
              ? normalizeStyleOverride(widgetOverrides.styles)
              : widget.styles
          }
          availableStyles={Object.keys(project.styles ?? {})}
          source={sources.styles}
          project={project}
          hasOverride={'styles' in widgetOverrides}
          onChange={(next) => updateProp(project, selectedWidgetId, 'styles', next)}
          onRevert={() => updateProp(project, selectedWidgetId, 'styles', undefined)}
        />

        {schema.map((item) => renderSchemaItem(item, renderRow))}

        {extraRows.map((key) => (
          <ReadOnlyRow
            key={key}
            label={key}
            value={formatValue(widget.props[key])}
            opaque={
              isOpaqueTag(widget.props[key])
                ? (widget.props[key] as { __tag: string }).__tag
                : undefined
            }
            origin={sources.props[key]?.file}
          />
        ))}
      </div>
    </div>
  );
}

function renderSchemaItem(
  item: SchemaItem,
  renderRow: (entry: SchemaEntry) => ReactNode,
): ReactNode {
  if (!isGroup(item)) return renderRow(item);
  return (
    <PropertyGroup key={item.key} label={item.label ?? item.key}>
      {item.entries.map((child) => renderRow({ ...child, key: `${item.key}.${child.key}` }))}
    </PropertyGroup>
  );
}

function shortFile(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}

/** Coerce whatever the override holds for `styles` back into a string[]. */
function normalizeStyleOverride(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return [v];
  return [];
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
