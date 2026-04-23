import type { EsphomeProject, WidgetId } from '../parser/types';

/**
 * LVGL states the renderer can preview on the currently-selected widget.
 * Mirrors the `WidgetState` type in the editor store, but kept here so the
 * renderer stays React-free and self-contained.
 */
export type PreviewState = 'pressed' | 'checked' | 'disabled';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  project: EsphomeProject;
  /** Triggered by widgets that load remote resources (images) — schedules a re-render. */
  requestRepaint: () => void;
  /** When set, render the matching widget as if this LVGL state were active. */
  activeState?: PreviewState;
  activeStateWidgetId?: WidgetId;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SIZE_CONTENT = -1;
