import type { EsphomeProject, WidgetId } from '../parser/types';
import type { DefaultTheme } from './defaultTheme';

/**
 * LVGL states the renderer can preview on the currently-selected widget.
 * Mirrors the `WidgetState` type in the editor store, but kept here so the
 * renderer stays React-free and self-contained.
 */
export type PreviewState = 'pressed' | 'checked' | 'disabled';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  project: EsphomeProject;
  /** LVGL default-theme tables for this project's mode (light/dark). */
  theme: DefaultTheme;
  /** Triggered by widgets that load remote resources (images) — schedules a re-render. */
  requestRepaint: () => void;
  /** Monotonic timestamp (performance.now()) of the current paint, for time-driven widgets like spinner. */
  frameTimeMs: number;
  /** When set, render the matching widget as if this LVGL state were active. */
  activeState?: PreviewState;
  activeStateWidgetId?: WidgetId;
  /**
   * Per-widget scroll position keyed by `WidgetId`. The renderer reads this to
   * shift the inner box used for child layout, mimicking LVGL's
   * `scroll_x`/`scroll_y` runtime state. Values may be unclamped — the
   * renderer clamps against the freshly measured content size.
   */
  scrollOffsets?: Record<WidgetId, { x: number; y: number }>;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SIZE_CONTENT = -1;
