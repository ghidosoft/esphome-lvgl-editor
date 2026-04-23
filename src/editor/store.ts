import { create } from 'zustand';
import type { EsphomeProject, LvglPage, LvglWidget, WidgetId } from '../parser/types';
import type { HitEntry } from '../renderer/CanvasStage';

/**
 * Editor state shared by canvas, overlay, and side-panels.
 *
 * Overrides hold unsaved prop edits keyed by widget id. They are applied
 * locally to the project for live repaint (`applyOverrides`) and, on save,
 * translated into `EditOp`s sent to `/__lvgl/edit` + `/__lvgl/commit`.
 */
export interface EditorState {
  selectedWidgetId: WidgetId | null;
  hitList: HitEntry[];
  activeTab: 'properties' | 'variables';
  /** Per-widget pending prop edits. Key is widgetId → propKey → new value. */
  overrides: Record<WidgetId, Record<string, unknown>>;
  /** True while /__lvgl/edit + commit are in flight. */
  saving: boolean;
  /** Last save error (network failure, conflict, etc.), cleared on next save attempt. */
  saveError: string | null;

  setSelected: (id: WidgetId | null) => void;
  setHitList: (list: HitEntry[]) => void;
  setActiveTab: (tab: 'properties' | 'variables') => void;
  /** Apply (or clear) a pending override. Pass undefined to revert to source. */
  updateProp: (id: WidgetId, key: string, value: unknown) => void;
  clearOverrides: () => void;
  setSaving: (v: boolean) => void;
  setSaveError: (e: string | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedWidgetId: null,
  hitList: [],
  activeTab: 'properties',
  overrides: {},
  saving: false,
  saveError: null,

  setSelected: (id) => set({ selectedWidgetId: id }),
  setHitList: (list) => set({ hitList: list }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  updateProp: (id, key, value) =>
    set((s) => {
      const next = { ...s.overrides };
      const forWidget = { ...(next[id] ?? {}) };
      if (value === undefined) {
        delete forWidget[key];
      } else {
        forWidget[key] = value;
      }
      if (Object.keys(forWidget).length === 0) {
        delete next[id];
      } else {
        next[id] = forWidget;
      }
      return { overrides: next };
    }),
  clearOverrides: () => set({ overrides: {} }),
  setSaving: (v) => set({ saving: v }),
  setSaveError: (e) => set({ saveError: e }),
}));

/**
 * Returns the topmost (deepest) widget whose box contains the point, or null.
 * Scans the hit list in reverse order so the child painted last (visually on
 * top) wins.
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
 * Produce a copy of `project` with `overrides` merged onto the matching widgets.
 * Returns the same reference when there are no overrides (caller can use it as
 * a cheap memo key for the canvas).
 */
export function applyOverrides(
  project: EsphomeProject,
  overrides: Record<WidgetId, Record<string, unknown>>,
): EsphomeProject {
  if (!project.pages.length || Object.keys(overrides).length === 0) return project;
  return { ...project, pages: project.pages.map((p) => overridePage(p, overrides)) };
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
