import { create } from 'zustand';
import type { EsphomeProject, LvglPage, LvglWidget, WidgetId } from '../parser/types';
import type { HitEntry } from '../renderer/CanvasStage';

/**
 * Editor state shared by canvas, overlay, and side-panels.
 *
 * Two kinds of pending edits coexist:
 *  - `widgetOverrides`: per-widget prop edits that are literal in the source
 *    (no `${var}` binding). Written back to the widget's own file.
 *  - `varOverrides`: edits to a substitution's value. They propagate to every
 *    widget consuming the variable (previewed live, then written to the
 *    substitution's definition file on save).
 *
 * When the user tweaks a var-backed prop (e.g. a widget whose `radius` was
 * `${radius_card}`), `updateProp` dispatches to `varOverrides` under the hood
 * — changing one widget changes every widget bound to that variable, which
 * matches how ESPHome substitutions work.
 */
export interface EditorState {
  selectedWidgetId: WidgetId | null;
  hitList: HitEntry[];
  activeTab: 'properties' | 'variables';
  widgetOverrides: Record<WidgetId, Record<string, unknown>>;
  varOverrides: Record<string, string>;
  saving: boolean;
  saveError: string | null;

  setSelected: (id: WidgetId | null) => void;
  setHitList: (list: HitEntry[]) => void;
  setActiveTab: (tab: 'properties' | 'variables') => void;
  /**
   * Update a widget property. Dispatches to `varOverrides` when the prop was
   * bound to `${var}` in the source — editing the var is what the user
   * actually wants in that case.
   */
  updateProp: (project: EsphomeProject, id: WidgetId, key: string, value: unknown) => void;
  /** Update a substitution's value directly (used by VariablesPanel). */
  updateVar: (name: string, value: string | undefined) => void;
  clearOverrides: () => void;
  setSaving: (v: boolean) => void;
  setSaveError: (e: string | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedWidgetId: null,
  hitList: [],
  activeTab: 'properties',
  widgetOverrides: {},
  varOverrides: {},
  saving: false,
  saveError: null,

  setSelected: (id) => set({ selectedWidgetId: id }),
  setHitList: (list) => set({ hitList: list }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  updateProp: (project, id, key, value) =>
    set((s) => {
      const propSource = project.sources?.[id]?.props[key];
      // Route var-backed edits to the substitution: changing "this radius"
      // actually means "change the radius_card variable".
      if (propSource?.viaVariable) {
        const varName = propSource.viaVariable;
        const nextVars = { ...s.varOverrides };
        if (value === undefined) delete nextVars[varName];
        else nextVars[varName] = String(value);
        return { varOverrides: nextVars };
      }
      const next = { ...s.widgetOverrides };
      const forWidget = { ...(next[id] ?? {}) };
      if (value === undefined) delete forWidget[key];
      else forWidget[key] = value;
      if (Object.keys(forWidget).length === 0) delete next[id];
      else next[id] = forWidget;
      return { widgetOverrides: next };
    }),
  updateVar: (name, value) =>
    set((s) => {
      const nextVars = { ...s.varOverrides };
      if (value === undefined) delete nextVars[name];
      else nextVars[name] = value;
      return { varOverrides: nextVars };
    }),
  clearOverrides: () => set({ widgetOverrides: {}, varOverrides: {} }),
  setSaving: (v) => set({ saving: v }),
  setSaveError: (e) => set({ saveError: e }),
}));

/**
 * Returns the topmost (deepest) widget whose box contains the point, or null.
 */
export function hitTest(hits: HitEntry[], x: number, y: number): HitEntry | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (x >= h.box.x && x < h.box.x + h.box.width && y >= h.box.y && y < h.box.y + h.box.height) {
      return h;
    }
  }
  return null;
}

/**
 * Produce a copy of `project` with pending overrides merged onto the matching
 * widgets. Two passes:
 *   1. widget-specific overrides (written directly onto widget.props)
 *   2. var overrides: resolve each substitution's `usages` list and apply the
 *      new value to every consumer (so the canvas preview matches post-save).
 *
 * Returns the original reference when there's nothing to merge.
 */
export function applyOverrides(
  project: EsphomeProject,
  widgetOverrides: Record<WidgetId, Record<string, unknown>>,
  varOverrides: Record<string, string>,
): EsphomeProject {
  const hasWidgetOverrides = Object.keys(widgetOverrides).length > 0;
  const hasVarOverrides = Object.keys(varOverrides).length > 0;
  if (!project.pages.length || (!hasWidgetOverrides && !hasVarOverrides)) return project;

  // Combine: start with widget overrides, then add var overrides expanded to
  // each consumer (widget-specific edits win on conflict — more local).
  const combined: Record<WidgetId, Record<string, unknown>> = {};
  for (const [id, patch] of Object.entries(widgetOverrides)) {
    combined[id] = { ...patch };
  }
  if (hasVarOverrides && project.substitutions) {
    for (const [varName, newValue] of Object.entries(varOverrides)) {
      const entry = project.substitutions[varName];
      if (!entry) continue;
      for (const usage of entry.usages) {
        const forWidget = (combined[usage.widgetId] ||= {});
        if (!(usage.propKey in forWidget)) {
          forWidget[usage.propKey] = newValue;
        }
      }
    }
  }

  return { ...project, pages: project.pages.map((p) => overridePage(p, combined)) };
}

function overridePage(page: LvglPage, overrides: Record<WidgetId, Record<string, unknown>>): LvglPage {
  return { ...page, widgets: page.widgets.map((w) => overrideWidget(w, overrides)) };
}

function overrideWidget(widget: LvglWidget, overrides: Record<WidgetId, Record<string, unknown>>): LvglWidget {
  const patch = widget.widgetId ? overrides[widget.widgetId] : undefined;
  const nextChildren = widget.children.length > 0
    ? widget.children.map((c) => overrideWidget(c, overrides))
    : widget.children;
  if (!patch && nextChildren === widget.children) return widget;
  return {
    ...widget,
    props: patch ? { ...widget.props, ...patch } : widget.props,
    children: nextChildren,
  };
}
