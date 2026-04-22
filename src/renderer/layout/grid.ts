import type { GridLayoutSpec, LvglWidget, TrackSize } from '../../parser/types';

export interface GridCell {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute pixel positions for every grid track given the parent's inner
 * dimensions. `content`-sized tracks are treated like fr(1) for now (we don't
 * have child measurements at this stage; ESPHome typically uses fr or fixed).
 */
export function computeTracks(tracks: TrackSize[], total: number, gap: number): { offsets: number[]; sizes: number[] } {
  if (tracks.length === 0) return { offsets: [], sizes: [] };
  const totalGap = gap * Math.max(0, tracks.length - 1);
  let fixedSum = 0;
  let frSum = 0;
  for (const t of tracks) {
    if (t.kind === 'px') fixedSum += t.value;
    else if (t.kind === 'fr') frSum += t.value;
    else frSum += 1;
  }
  const remaining = Math.max(0, total - totalGap - fixedSum);
  const frUnit = frSum > 0 ? remaining / frSum : 0;

  const sizes: number[] = [];
  for (const t of tracks) {
    if (t.kind === 'px') sizes.push(t.value);
    else if (t.kind === 'fr') sizes.push(t.value * frUnit);
    else sizes.push(frUnit);
  }
  const offsets: number[] = [];
  let cursor = 0;
  for (let i = 0; i < sizes.length; i++) {
    offsets.push(cursor);
    cursor += sizes[i] + gap;
  }
  return { offsets, sizes };
}

export interface ResolvedGrid {
  cellFor(child: LvglWidget): GridCell;
}

/**
 * Build a resolver that, given a child widget, returns its grid cell rect
 * within the parent's inner content box (i.e. local origin (0,0)).
 */
export function buildGrid(spec: GridLayoutSpec, parentInner: { width: number; height: number }): ResolvedGrid {
  const cols = computeTracks(spec.columns, parentInner.width, spec.pad_column ?? 0);
  const rows = computeTracks(spec.rows, parentInner.height, spec.pad_row ?? 0);

  return {
    cellFor(child) {
      const colPos = numProp(child.props.grid_cell_column_pos, 0);
      const rowPos = numProp(child.props.grid_cell_row_pos, 0);
      const colSpan = Math.max(1, numProp(child.props.grid_cell_column_span, 1));
      const rowSpan = Math.max(1, numProp(child.props.grid_cell_row_span, 1));

      const colStart = clamp(colPos, 0, cols.offsets.length - 1);
      const rowStart = clamp(rowPos, 0, rows.offsets.length - 1);
      const colEnd = Math.min(colStart + colSpan - 1, cols.offsets.length - 1);
      const rowEnd = Math.min(rowStart + rowSpan - 1, rows.offsets.length - 1);

      const x = cols.offsets[colStart];
      const y = rows.offsets[rowStart];
      const width =
        cols.offsets[colEnd] + cols.sizes[colEnd] - x;
      const height =
        rows.offsets[rowEnd] + rows.sizes[rowEnd] - y;

      return { x, y, width, height };
    },
  };
}

function numProp(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
