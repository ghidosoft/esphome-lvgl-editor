import type { EsphomeProject } from '../parser/types';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  project: EsphomeProject;
  /** Triggered by widgets that load remote resources (images) — schedules a re-render. */
  requestRepaint: () => void;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SIZE_CONTENT = -1;
