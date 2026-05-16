import { useState, type ReactNode } from 'react';
import type { EsphomeProject, LvglWidget, PropSource, WidgetId } from '../parser/types';
import { isOpaqueTag } from '../parser/types';
import { useEditorStore, type WidgetState } from '../editor/store';
import {
  getSchema,
  isGroup,
  type SchemaEntry,
  type SchemaGroup,
  type SchemaItem,
} from '../editor/schema';
import {
  SECTION_LABELS,
  SECTION_ORDER,
  STATE_AWARE_SECTIONS,
  getSection,
  isStateAware,
  type SectionId,
} from '../editor/schema/sections';
import { getNested, splitKey } from '../editor/nestedKey';
import { PropControl } from './PropControl';
import { StylesField } from './StylesField';
import { Breadcrumb } from './Breadcrumb';
import { StateToggleStrip } from './StateToggleStrip';
import { PropertyRow, type VarBinding } from './inspector/PropertyRow';
import { PropertyGroup } from './inspector/PropertyGroup';
import { ReadOnlyRow } from './inspector/ReadOnlyRow';
import { InspectorHeader } from './inspector/InspectorHeader';
import { Icon } from './inspector/Icon';
import { DimensionGrid, type DimensionSide } from './inspector/fields/DimensionGrid';

interface Props {
  project: EsphomeProject;
}

interface RowState {
  fullKey: string;
  displayLabel: string;
  effective: unknown;
  source?: PropSource;
  hasOverride: boolean;
  pendingDelete: boolean;
  existsInSource: boolean;
  existsNow: boolean;
  varBinding?: VarBinding;
  template: boolean;
  disabled: boolean;
  canDelete: boolean;
}

interface RenderableEntry {
  kind: 'entry';
  entry: SchemaEntry;
  state: RowState;
}

interface RenderableSubgroup {
  kind: 'subgroup';
  group: SchemaGroup;
  rows: RenderableEntry[];
  modifiedCount: number;
}

type RenderableItem = RenderableEntry | RenderableSubgroup;

interface RenderableSection {
  id: SectionId;
  label: string;
  stateAware: boolean;
  items: RenderableItem[];
  modifiedCount: number;
  hasQueryMatch: boolean;
}

/**
 * Property editor for the selected widget. Schema entries are bucketed into
 * semantic sections (Layout, Spacing, Background, …); each section is a
 * collapsible group with persisted open-state. The state selector at the top
 * multiplexes state-aware entries (bg_color, border_*, radius, text_*) into
 * the active LVGL state's namespace, replacing the previous trio of trailing
 * "Pressed/Checked/Disabled" groups. Schema hints drive compound controls:
 * `inline:'half'` packs entries into 2-up rows, `linkedGroup` collapses them
 * into a DimensionGrid, `slider` promotes a number to numeric+slider, `icon`
 * surfaces a glyph next to the label.
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

  const [query, setQuery] = useState('');
  const [modifiedOnly, setModifiedOnly] = useState(false);

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
  const parentWidget = findParentWidget(project, selectedWidgetId);

  const isVisible = (entry: SchemaEntry): boolean => {
    const v = entry.visibleWhen;
    if (!v) return true;
    const target = v.scope === 'parent' ? parentWidget : widget;
    if (!target) return false;
    const actual = getNested(target.props, splitKey(v.key));
    const expected = Array.isArray(v.equals) ? v.equals : [v.equals];
    return expected.some((e) => e === actual);
  };

  const computeRow = (entry: SchemaEntry, displayLabel: string): RowState => {
    const fullKey = entry.key;
    const source = sources.props[fullKey];
    const varName = source?.viaVariable;
    const varOverride = varName ? varOverrides[varName] : undefined;
    const hasVarOverride = varName != null && varName in varOverrides;
    const hasWidgetOverride = fullKey in widgetOverrides;
    const pendingDelete = pendingDeletions.includes(fullKey);
    const hasOverride = hasVarOverride || hasWidgetOverride || pendingDelete;
    const existsInSource = source != null;
    const path = splitKey(fullKey);
    const existsNow = getNested(widget.props, path) !== undefined;
    const effective = hasVarOverride
      ? varOverride
      : hasWidgetOverride
        ? widgetOverrides[fullKey]
        : getNested(widget.props, path);
    const isVarBacked = !!source?.viaVariable;
    const template = !!source?.template;
    const disabled = template || pendingDelete;
    const sub = source?.viaVariable ? project.substitutions?.[source.viaVariable] : undefined;
    const canDelete = existsInSource && !isVarBacked && !template;
    return {
      fullKey,
      displayLabel,
      effective,
      source,
      hasOverride,
      pendingDelete,
      existsInSource,
      existsNow,
      varBinding: source?.viaVariable
        ? { name: source.viaVariable, usages: sub?.usages.length }
        : undefined,
      template,
      disabled,
      canDelete,
    };
  };

  const sections = bucketSchema(schema, activeState, computeRow, isVisible);
  const queryLower = query.trim().toLowerCase();
  const filteredSections = filterSections(sections, queryLower, modifiedOnly);

  const renderEntry = (e: RenderableEntry): ReactNode => {
    const { entry, state } = e;
    return (
      <PropertyRow
        key={state.fullKey}
        label={state.displayLabel}
        icon={entry.icon ? <Icon name={entry.icon} /> : undefined}
        dirty={state.hasOverride}
        unset={!state.existsNow && !state.hasOverride}
        pendingDelete={state.pendingDelete}
        disabled={state.disabled}
        varBinding={state.varBinding}
        template={state.template}
        origin={state.source?.file}
        canRevert={state.hasOverride}
        canDelete={state.canDelete && !state.pendingDelete}
        onRevert={() => updateProp(project, selectedWidgetId, state.fullKey, undefined)}
        onDelete={() => deleteProp(selectedWidgetId, state.fullKey)}
      >
        <PropControl
          entry={entry}
          value={state.effective}
          onChange={(v) => updateProp(project, selectedWidgetId, state.fullKey, v)}
          disabled={state.disabled}
        />
      </PropertyRow>
    );
  };

  const renderInlinePair = (entries: RenderableEntry[]): ReactNode => (
    <div className="prop-row prop-row--inline" key={entries.map((e) => e.state.fullKey).join(':')}>
      {entries.map((e) => (
        <InlineCell
          key={e.state.fullKey}
          entry={e.entry}
          state={e.state}
          onChange={(v) => updateProp(project, selectedWidgetId, e.state.fullKey, v)}
          onRevert={() => updateProp(project, selectedWidgetId, e.state.fullKey, undefined)}
          onDelete={() => deleteProp(selectedWidgetId, e.state.fullKey)}
        />
      ))}
    </div>
  );

  const renderLinkedGroup = (
    groupName: string,
    entries: RenderableEntry[],
  ): ReactNode | ReactNode[] => {
    if (groupName === 'padding') {
      const sides: DimensionSide[] = entries.map((e) => ({
        key: e.state.fullKey,
        label: e.entry.label ?? e.state.displayLabel,
        value: e.state.effective,
        dirty: e.state.hasOverride,
        disabled: e.state.disabled,
        origin: e.state.source?.file,
      }));
      const dirtyKeys = entries.filter((e) => e.state.hasOverride).map((e) => e.state.fullKey);
      return (
        <DimensionGrid
          key={`linked-${groupName}`}
          sides={sides}
          iconName="pad"
          groupLabel="padding"
          linkPrefKey="padding"
          onSideChange={(key, v) => updateProp(project, selectedWidgetId, key, v)}
          onAllChange={(v) =>
            entries.forEach((e) => updateProp(project, selectedWidgetId, e.state.fullKey, v))
          }
          onRevertAll={
            dirtyKeys.length > 0
              ? () => dirtyKeys.forEach((k) => updateProp(project, selectedWidgetId, k, undefined))
              : undefined
          }
        />
      );
    }
    return entries.map(renderEntry);
  };

  const renderItem = (item: RenderableItem): ReactNode => {
    if (item.kind === 'entry') return renderEntry(item);
    return (
      <PropertyGroup
        key={item.group.key}
        label={item.group.label ?? item.group.key}
        modifiedCount={item.modifiedCount}
        forceOpen={!!queryLower}
        persistKey={`${widget.type}.parts.${item.group.key}`}
      >
        {item.rows.map(renderEntry)}
      </PropertyGroup>
    );
  };

  const renderSectionContents = (items: RenderableItem[]): ReactNode[] => {
    const out: ReactNode[] = [];
    let inlineQueue: RenderableEntry[] = [];
    let linkedQueue: { name: string; entries: RenderableEntry[] } | null = null;

    const flushInline = () => {
      while (inlineQueue.length >= 2) {
        out.push(renderInlinePair(inlineQueue.splice(0, 2)));
      }
      if (inlineQueue.length === 1) {
        out.push(renderEntry(inlineQueue[0]));
        inlineQueue = [];
      }
    };
    const flushLinked = () => {
      if (!linkedQueue) return;
      const node = renderLinkedGroup(linkedQueue.name, linkedQueue.entries);
      if (Array.isArray(node)) out.push(...node);
      else out.push(node);
      linkedQueue = null;
    };

    for (const item of items) {
      if (item.kind === 'subgroup') {
        flushInline();
        flushLinked();
        out.push(renderItem(item));
        continue;
      }
      const entry = item.entry;
      if (entry.inline === 'half') {
        flushLinked();
        inlineQueue.push(item);
        continue;
      }
      if (entry.linkedGroup) {
        flushInline();
        if (!linkedQueue || linkedQueue.name !== entry.linkedGroup) {
          flushLinked();
          linkedQueue = { name: entry.linkedGroup, entries: [] };
        }
        linkedQueue.entries.push(item);
        continue;
      }
      flushInline();
      flushLinked();
      out.push(renderEntry(item));
    }
    flushInline();
    flushLinked();
    return out;
  };

  const schemaKeys = collectSchemaKeys(schema);
  // `layout` lives on widget.props (post-parser change) but is fully covered by
  // dotted-key schema entries (`layout.type`, `layout.pad_row`, …) — don't
  // surface the bare object as a read-only "Other" row.
  const extraRows = Object.keys(widget.props).filter(
    (k) => k !== 'layout' && !schemaKeys.has(k) && !isStatePrefixedKey(k),
  );

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
        <InspectorHeader
          query={query}
          onQueryChange={setQuery}
          modifiedOnly={modifiedOnly}
          onModifiedOnlyChange={setModifiedOnly}
        />
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

        {filteredSections.map((section) => (
          <PropertyGroup
            key={section.id}
            label={section.label}
            modifiedCount={section.modifiedCount}
            forceOpen={section.hasQueryMatch}
            persistKey={`${widget.type}.${section.id}`}
            badge={
              section.stateAware && activeState !== 'default' ? (
                <StatePill state={activeState} />
              ) : undefined
            }
          >
            {renderSectionContents(section.items)}
          </PropertyGroup>
        ))}

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

function StatePill({ state }: { state: WidgetState }) {
  return (
    <span className="prop-group__state-pill" title={`Editing :${state} state`}>
      :{state}
    </span>
  );
}

function InlineCell({
  entry,
  state,
  onChange,
  onRevert,
  onDelete,
}: {
  entry: SchemaEntry;
  state: RowState;
  onChange: (v: unknown) => void;
  onRevert: () => void;
  onDelete: () => void;
}) {
  const cellLabel = entry.label ?? state.displayLabel;
  const isVarBacked = !!state.varBinding;
  const canDelete = state.existsInSource && !isVarBacked && !state.template && !state.pendingDelete;
  return (
    <div
      className={
        'inline-cell' +
        (state.hasOverride ? ' inline-cell--dirty' : '') +
        (state.pendingDelete ? ' inline-cell--pending-delete' : '') +
        (!state.existsNow && !state.hasOverride ? ' inline-cell--unset' : '')
      }
    >
      <span
        className="inline-cell__label"
        title={state.pendingDelete ? `${state.displayLabel} — pending removal` : state.displayLabel}
      >
        {cellLabel}
      </span>
      <PropControl
        entry={entry}
        value={state.effective}
        onChange={onChange}
        disabled={state.disabled}
      />
      {state.varBinding && (
        <span className="inline-cell__var" title={`Bound to \${${state.varBinding.name}}`}>
          var
        </span>
      )}
      {state.hasOverride && (
        <button
          type="button"
          className="prop-row__btn"
          title={state.pendingDelete ? 'Cancel pending removal' : 'Revert to source'}
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
  );
}

function bucketSchema(
  schema: SchemaItem[],
  activeState: WidgetState,
  computeRow: (entry: SchemaEntry, displayLabel: string) => RowState,
  isVisible: (entry: SchemaEntry) => boolean,
): RenderableSection[] {
  const buckets = new Map<SectionId, RenderableItem[]>();
  const counts = new Map<SectionId, number>();

  const push = (id: SectionId, item: RenderableItem) => {
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id)!.push(item);
    if (item.kind === 'entry' && item.state.hasOverride) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    } else if (item.kind === 'subgroup') {
      counts.set(id, (counts.get(id) ?? 0) + item.modifiedCount);
    }
  };

  for (const item of schema) {
    if (isGroup(item)) {
      const rows: RenderableEntry[] = item.entries.map((child) => {
        const synth: SchemaEntry = { ...child, key: `${item.key}.${child.key}` };
        return { kind: 'entry', entry: synth, state: computeRow(synth, child.key) };
      });
      const modified = rows.filter((r) => r.state.hasOverride).length;
      push('parts', { kind: 'subgroup', group: item, rows, modifiedCount: modified });
      continue;
    }
    if (!isVisible(item)) continue;
    const bareKey = item.key;
    const sectionId = getSection(bareKey, 'widget');
    const stateMux = activeState !== 'default' && isStateAware(bareKey);
    if (stateMux) {
      const synth: SchemaEntry = { ...item, key: `${activeState}.${bareKey}` };
      push(sectionId, { kind: 'entry', entry: synth, state: computeRow(synth, bareKey) });
    } else {
      push(sectionId, { kind: 'entry', entry: item, state: computeRow(item, bareKey) });
    }
  }

  return SECTION_ORDER.flatMap((id): RenderableSection[] => {
    const items = buckets.get(id);
    if (!items || items.length === 0) return [];
    return [
      {
        id,
        label: SECTION_LABELS[id],
        stateAware: STATE_AWARE_SECTIONS.has(id),
        items,
        modifiedCount: counts.get(id) ?? 0,
        hasQueryMatch: false,
      },
    ];
  });
}

function filterSections(
  sections: RenderableSection[],
  queryLower: string,
  modifiedOnly: boolean,
): RenderableSection[] {
  if (!queryLower && !modifiedOnly) return sections;

  const matchesEntry = (e: RenderableEntry): boolean => {
    if (modifiedOnly && !e.state.hasOverride) return false;
    if (queryLower && !e.state.displayLabel.toLowerCase().includes(queryLower)) return false;
    return true;
  };

  return sections.flatMap((s): RenderableSection[] => {
    const items: RenderableItem[] = [];
    let hasQueryMatch = false;
    for (const item of s.items) {
      if (item.kind === 'entry') {
        if (matchesEntry(item)) {
          items.push(item);
          if (queryLower && item.state.displayLabel.toLowerCase().includes(queryLower)) {
            hasQueryMatch = true;
          }
        }
      } else {
        const filteredRows = item.rows.filter(matchesEntry);
        if (filteredRows.length === 0) continue;
        const groupMatches =
          queryLower &&
          (filteredRows.some((r) => r.state.displayLabel.toLowerCase().includes(queryLower)) ||
            (item.group.label ?? item.group.key).toLowerCase().includes(queryLower));
        if (groupMatches) hasQueryMatch = true;
        items.push({ ...item, rows: filteredRows });
      }
    }
    if (items.length === 0) return [];
    return [{ ...s, items, hasQueryMatch }];
  });
}

function collectSchemaKeys(schema: SchemaItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of schema) keys.add(item.key);
  return keys;
}

function isStatePrefixedKey(key: string): boolean {
  return key === 'pressed' || key === 'checked' || key === 'disabled';
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

function findParentWidget(project: EsphomeProject, id: WidgetId): LvglWidget | null {
  for (const page of project.pages) {
    const hit = walkParent(page.widgets, id, null);
    if (hit) return hit;
  }
  return null;
}

function walkParent(
  widgets: LvglWidget[],
  id: WidgetId,
  parent: LvglWidget | null,
): LvglWidget | null {
  for (const w of widgets) {
    if (w.widgetId === id) return parent;
    const hit = walkParent(w.children, id, w);
    if (hit !== null) return hit;
    // hit === null can mean "found and parent was null" (top-level) — distinguish
    // by also checking direct match above.
  }
  return null;
}
