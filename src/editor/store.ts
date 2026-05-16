import { create } from 'zustand';
import type { EsphomeProject, LvglPage, LvglWidget, WidgetId } from '../parser/types';
import { readLayout } from '../parser/lvglNormalize';
import type { HitEntry } from '../renderer/CanvasStage';
import { deleteNested, setNested, splitKey } from './nestedKey';

/**
 * LVGL per-widget visual state for preview. `default` means "no state forced",
 * anything else previews the widget as if that state were active — reading
 * the corresponding `pressed:` / `checked:` / `disabled:` YAML block on top
 * of the default props. Single-select for now (mirrors Chromium DevTools'
 * typical usage of `:hov` toggles even though multiple can combine).
 */
export type WidgetState = 'default' | 'pressed' | 'checked' | 'disabled';

/**
 * Project-level pending edits for "general" settings (display dimensions,
 * theme). Independent from `widgetOverrides` because there's no `WidgetId` to
 * key them on, and from `varOverrides` because they don't go through a
 * substitution definition.
 */
export interface ProjectOverrides {
  displayWidth?: number;
  displayHeight?: number;
  darkMode?: boolean;
}

export type ProjectOverrideKey = keyof ProjectOverrides;

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
  activeTab: 'properties' | 'variables' | 'styles' | 'project';
  /** Forced LVGL state for the selected widget's preview. Reset on re-selection. */
  activeState: WidgetState;
  widgetOverrides: Record<WidgetId, Record<string, unknown>>;
  varOverrides: Record<string, string>;
  /** Per-style prop edits. Same shape as widgetOverrides. */
  styleOverrides: Record<string, Record<string, unknown>>;
  /** Per-widget set of prop keys pending removal from the YAML source. */
  widgetDeletions: Record<WidgetId, string[]>;
  /** Per-style set of prop keys pending removal. */
  styleDeletions: Record<string, string[]>;
  /** Pending edits to display dimensions and theme. */
  projectOverrides: ProjectOverrides;
  /**
   * Editor-only preview toggle: when true the canvas renders widgets even if
   * their YAML has `hidden: true`. Off by default so the preview matches the
   * device — flip it on to work on modal overlays without touching the source.
   */
  showHidden: boolean;
  /**
   * Per-scrollable-widget scroll position, mirroring the LVGL `scroll_x` /
   * `scroll_y` runtime state. Reset on page change (positions are page-local).
   * The renderer reads this to offset child layout; the wheel handler writes
   * to it after clamping against the latest content size.
   */
  scrollOffsets: Record<WidgetId, { x: number; y: number }>;
  saveError: string | null;

  setSelected: (id: WidgetId | null) => void;
  setHitList: (list: HitEntry[]) => void;
  setActiveTab: (tab: 'properties' | 'variables' | 'styles' | 'project') => void;
  setActiveState: (state: WidgetState) => void;
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
  /** Update a project-level setting (display, theme). `undefined` reverts. */
  updateProjectSetting: <K extends ProjectOverrideKey>(
    key: K,
    value: ProjectOverrides[K] | undefined,
  ) => void;
  clearOverrides: () => void;
  setShowHidden: (v: boolean) => void;
  /** Set the absolute scroll position of `id`. Caller is responsible for clamping. */
  setScrollOffset: (id: WidgetId, x: number, y: number) => void;
  /** Drop all scroll positions — invoked on page change. */
  clearScrollOffsets: () => void;
  setSaveError: (e: string | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedWidgetId: null,
  hitList: [],
  activeTab: 'properties',
  activeState: 'default',
  widgetOverrides: {},
  varOverrides: {},
  styleOverrides: {},
  widgetDeletions: {},
  styleDeletions: {},
  projectOverrides: {},
  showHidden: false,
  scrollOffsets: {},
  saveError: null,

  // Reset the forced state whenever the selection changes — Chromium-style
  // per-element scoping: state toggles belong to "what's currently selected".
  setSelected: (id) => set({ selectedWidgetId: id, activeState: 'default' }),
  setHitList: (list) => set({ hitList: list }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveState: (state) => set({ activeState: state }),
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
  updateProjectSetting: (key, value) =>
    set((s) => {
      const next = { ...s.projectOverrides };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return { projectOverrides: next };
    }),
  clearOverrides: () =>
    set({
      widgetOverrides: {},
      varOverrides: {},
      widgetDeletions: {},
      styleOverrides: {},
      styleDeletions: {},
      projectOverrides: {},
    }),
  setShowHidden: (v) => set({ showHidden: v }),
  setScrollOffset: (id, x, y) =>
    set((s) => ({ scrollOffsets: { ...s.scrollOffsets, [id]: { x, y } } })),
  clearScrollOffsets: () => set({ scrollOffsets: {} }),
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
  projectOverrides: ProjectOverrides = {},
): EsphomeProject {
  const hasWidgetOverrides = Object.keys(widgetOverrides).length > 0;
  const hasVarOverrides = Object.keys(varOverrides).length > 0;
  const hasWidgetDeletions = Object.keys(widgetDeletions).length > 0;
  const hasStyleOverrides = Object.keys(styleOverrides).length > 0;
  const hasStyleDeletions = Object.keys(styleDeletions).length > 0;
  const hasProjectOverrides = Object.keys(projectOverrides).length > 0;
  const nothing =
    !hasWidgetOverrides &&
    !hasVarOverrides &&
    !hasWidgetDeletions &&
    !hasStyleOverrides &&
    !hasStyleDeletions &&
    !hasProjectOverrides;
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
  const nextDisplay =
    projectOverrides.displayWidth !== undefined || projectOverrides.displayHeight !== undefined
      ? {
          width: projectOverrides.displayWidth ?? project.display.width,
          height: projectOverrides.displayHeight ?? project.display.height,
        }
      : project.display;
  const nextTheme =
    projectOverrides.darkMode !== undefined
      ? { darkMode: projectOverrides.darkMode }
      : project.theme;
  return {
    ...project,
    pages: nextPages,
    styles: nextStyles,
    display: nextDisplay,
    theme: nextTheme,
  };
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
  const nextChildren =
    widget.children.length > 0
      ? widget.children.map((c) => overrideWidget(c, overrides, deletions))
      : widget.children;
  if (!patch && (!del || del.length === 0) && nextChildren === widget.children) return widget;

  let nextProps = widget.props;
  let nextStyles = widget.styles;
  if (patch || (del && del.length > 0)) {
    // `styles` is a separate field on LvglWidget (not part of props) because
    // the renderer cascades them. Route overrides there; skip when the patch
    // only touches props.
    const { styles: styleOverride, ...propPatch } = patch ?? {};
    // Dotted keys (e.g. "indicator.bg_color") land on nested part blocks;
    // flat keys overwrite top-level props as before.
    nextProps = { ...widget.props };
    for (const [key, value] of Object.entries(propPatch)) {
      const path = splitKey(key);
      nextProps =
        path.length === 1 ? { ...nextProps, [path[0]]: value } : setNested(nextProps, path, value);
    }
    if (del) {
      for (const key of del) {
        const path = splitKey(key);
        nextProps =
          path.length === 1
            ? (() => {
                const { [path[0]]: _, ...rest } = nextProps;
                return rest;
              })()
            : deleteNested(nextProps, path);
      }
    }
    if (styleOverride !== undefined) {
      nextStyles = Array.isArray(styleOverride)
        ? (styleOverride as unknown[]).filter((x): x is string => typeof x === 'string')
        : typeof styleOverride === 'string'
          ? [styleOverride]
          : [];
    }
  }
  // The renderer reads from `widget.layout` (typed cache), not
  // `widget.props.layout` — re-derive the cache when the raw layout object
  // changed so live edits propagate to the canvas.
  const nextLayout =
    nextProps.layout !== widget.props.layout
      ? readLayout(nextProps.layout, [], widget.type)
      : widget.layout;
  return {
    ...widget,
    props: nextProps,
    styles: nextStyles,
    layout: nextLayout,
    children: nextChildren,
  };
}
