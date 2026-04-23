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
  activeTab: 'properties' | 'variables' | 'styles';
  widgetOverrides: Record<WidgetId, Record<string, unknown>>;
  varOverrides: Record<string, string>;
  /** Per-style prop edits. Same shape as widgetOverrides. */
  styleOverrides: Record<string, Record<string, unknown>>;
  /** Per-widget set of prop keys pending removal from the YAML source. */
  widgetDeletions: Record<WidgetId, string[]>;
  /** Per-style set of prop keys pending removal. */
  styleDeletions: Record<string, string[]>;
  saving: boolean;
  saveError: string | null;

  setSelected: (id: WidgetId | null) => void;
  setHitList: (list: HitEntry[]) => void;
  setActiveTab: (tab: 'properties' | 'variables' | 'styles') => void;
  /**
   * Update a widget property. Dispatches to `varOverrides` when the prop was
   * bound to `${var}` in the source — editing the var is what the user
   * actually wants in that case. Passing `undefined` reverts any pending edit
   * (override or deletion) and leaves the source value intact.
   */
  updateProp: (project: EsphomeProject, id: WidgetId, key: string, value: unknown) => void;
  /** Mark a widget prop for removal from the YAML source on save. */
  deleteProp: (id: WidgetId, key: string) => void;
  /**
   * Update a style's property. Dispatches to `varOverrides` for var-backed
   * props, otherwise stores in `styleOverrides`.
   */
  updateStyleProp: (project: EsphomeProject, styleId: string, key: string, value: unknown) => void;
  /** Mark a style prop for removal from the YAML source on save. */
  deleteStyleProp: (styleId: string, key: string) => void;
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
  styleOverrides: {},
  widgetDeletions: {},
  styleDeletions: {},
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
      const nextOv = { ...s.widgetOverrides };
      const forWidget = { ...(nextOv[id] ?? {}) };
      if (value === undefined) delete forWidget[key];
      else forWidget[key] = value;
      if (Object.keys(forWidget).length === 0) delete nextOv[id];
      else nextOv[id] = forWidget;
      // Revert/update cancels a pending deletion on the same key.
      const nextDel = { ...s.widgetDeletions };
      const keys = (nextDel[id] ?? []).filter((k) => k !== key);
      if (keys.length === 0) delete nextDel[id];
      else nextDel[id] = keys;
      return { widgetOverrides: nextOv, widgetDeletions: nextDel };
    }),
  deleteProp: (id, key) =>
    set((s) => {
      const nextDel = { ...s.widgetDeletions };
      const existing = nextDel[id] ?? [];
      if (!existing.includes(key)) nextDel[id] = [...existing, key];
      // Drop any pending override for this key — deletion wins.
      const nextOv = { ...s.widgetOverrides };
      if (nextOv[id]) {
        const { [key]: _drop, ...rest } = nextOv[id];
        if (Object.keys(rest).length === 0) delete nextOv[id];
        else nextOv[id] = rest;
      }
      return { widgetDeletions: nextDel, widgetOverrides: nextOv };
    }),
  updateStyleProp: (project, styleId, key, value) =>
    set((s) => {
      const propSource = project.styleSources?.[styleId]?.props[key];
      if (propSource?.viaVariable) {
        const varName = propSource.viaVariable;
        const nextVars = { ...s.varOverrides };
        if (value === undefined) delete nextVars[varName];
        else nextVars[varName] = String(value);
        return { varOverrides: nextVars };
      }
      const nextOv = { ...s.styleOverrides };
      const forStyle = { ...(nextOv[styleId] ?? {}) };
      if (value === undefined) delete forStyle[key];
      else forStyle[key] = value;
      if (Object.keys(forStyle).length === 0) delete nextOv[styleId];
      else nextOv[styleId] = forStyle;
      const nextDel = { ...s.styleDeletions };
      const keys = (nextDel[styleId] ?? []).filter((k) => k !== key);
      if (keys.length === 0) delete nextDel[styleId];
      else nextDel[styleId] = keys;
      return { styleOverrides: nextOv, styleDeletions: nextDel };
    }),
  deleteStyleProp: (styleId, key) =>
    set((s) => {
      const nextDel = { ...s.styleDeletions };
      const existing = nextDel[styleId] ?? [];
      if (!existing.includes(key)) nextDel[styleId] = [...existing, key];
      const nextOv = { ...s.styleOverrides };
      if (nextOv[styleId]) {
        const { [key]: _drop, ...rest } = nextOv[styleId];
        if (Object.keys(rest).length === 0) delete nextOv[styleId];
        else nextOv[styleId] = rest;
      }
      return { styleDeletions: nextDel, styleOverrides: nextOv };
    }),
  updateVar: (name, value) =>
    set((s) => {
      const nextVars = { ...s.varOverrides };
      if (value === undefined) delete nextVars[name];
      else nextVars[name] = value;
      return { varOverrides: nextVars };
    }),
  clearOverrides: () =>
    set({
      widgetOverrides: {},
      varOverrides: {},
      widgetDeletions: {},
      styleOverrides: {},
      styleDeletions: {},
    }),
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
  widgetDeletions: Record<WidgetId, string[]> = {},
  styleOverrides: Record<string, Record<string, unknown>> = {},
  styleDeletions: Record<string, string[]> = {},
): EsphomeProject {
  const hasWidgetOverrides = Object.keys(widgetOverrides).length > 0;
  const hasVarOverrides = Object.keys(varOverrides).length > 0;
  const hasWidgetDeletions = Object.keys(widgetDeletions).length > 0;
  const hasStyleOverrides = Object.keys(styleOverrides).length > 0;
  const hasStyleDeletions = Object.keys(styleDeletions).length > 0;
  const nothing =
    !hasWidgetOverrides &&
    !hasVarOverrides &&
    !hasWidgetDeletions &&
    !hasStyleOverrides &&
    !hasStyleDeletions;
  if (!project.pages.length && nothing) return project;
  if (nothing) return project;

  // --- Widgets: combine widgetOverrides + var-expansion + deletions.
  const widgetCombined: Record<WidgetId, Record<string, unknown>> = {};
  for (const [id, patch] of Object.entries(widgetOverrides)) widgetCombined[id] = { ...patch };

  // --- Styles: combine styleOverrides + var-expansion.
  const styleCombined: Record<string, Record<string, unknown>> = {};
  for (const [id, patch] of Object.entries(styleOverrides)) styleCombined[id] = { ...patch };

  if (hasVarOverrides && project.substitutions) {
    for (const [varName, newValue] of Object.entries(varOverrides)) {
      const entry = project.substitutions[varName];
      if (!entry) continue;
      for (const usage of entry.usages) {
        if (usage.kind === 'widget') {
          const forWidget = (widgetCombined[usage.widgetId] ||= {});
          if (!(usage.propKey in forWidget)) forWidget[usage.propKey] = newValue;
        } else {
          const forStyle = (styleCombined[usage.styleId] ||= {});
          if (!(usage.propKey in forStyle)) forStyle[usage.propKey] = newValue;
        }
      }
    }
  }

  const nextStyles = applyStylePatches(project.styles, styleCombined, styleDeletions);
  const nextPages = project.pages.map((p) => overridePage(p, widgetCombined, widgetDeletions));
  return { ...project, pages: nextPages, styles: nextStyles };
}

function applyStylePatches(
  styles: EsphomeProject['styles'],
  overrides: Record<string, Record<string, unknown>>,
  deletions: Record<string, string[]>,
): EsphomeProject['styles'] {
  const hasOv = Object.keys(overrides).length > 0;
  const hasDel = Object.keys(deletions).length > 0;
  if (!hasOv && !hasDel) return styles;
  const out: EsphomeProject['styles'] = {};
  for (const [id, spec] of Object.entries(styles)) {
    const ov = overrides[id];
    const del = deletions[id];
    if (!ov && (!del || del.length === 0)) {
      out[id] = spec;
      continue;
    }
    const nextProps: Record<string, unknown> = { ...spec.props, ...(ov ?? {}) };
    if (del) for (const k of del) delete nextProps[k];
    out[id] = { ...spec, props: nextProps };
  }
  // Preserve styles not present in the original record (shouldn't happen, but safe).
  for (const id of Object.keys(overrides)) if (!(id in out)) out[id] = styles[id];
  return out;
}


function overridePage(
  page: LvglPage,
  overrides: Record<WidgetId, Record<string, unknown>>,
  deletions: Record<WidgetId, string[]>,
): LvglPage {
  return { ...page, widgets: page.widgets.map((w) => overrideWidget(w, overrides, deletions)) };
}

function overrideWidget(
  widget: LvglWidget,
  overrides: Record<WidgetId, Record<string, unknown>>,
  deletions: Record<WidgetId, string[]>,
): LvglWidget {
  const patch = widget.widgetId ? overrides[widget.widgetId] : undefined;
  const del = widget.widgetId ? deletions[widget.widgetId] : undefined;
  const nextChildren = widget.children.length > 0
    ? widget.children.map((c) => overrideWidget(c, overrides, deletions))
    : widget.children;
  if (!patch && (!del || del.length === 0) && nextChildren === widget.children) return widget;
  let nextProps = widget.props;
  if (patch || (del && del.length > 0)) {
    nextProps = { ...widget.props, ...(patch ?? {}) };
    if (del) for (const key of del) delete nextProps[key];
  }
  return { ...widget, props: nextProps, children: nextChildren };
}
