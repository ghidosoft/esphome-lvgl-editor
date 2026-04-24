import type { LvglWidget, StyleSpec } from '../parser/types';
import { alignChild } from './align';
import { resolveProp } from './styles';
import type { Box } from './context';

/**
 * Compute the absolute box of a widget given its parent inner box and an
 * optional layout slot. Shared between the canvas renderer (painting) and
 * the hit-testing layer (click-to-select) so both agree exactly.
 *
 * Two cases:
 *   1. Parent has a layout engine ⇒ slot is provided. The widget fills the
 *      slot (STRETCH align), or shrinks to its declared width/height and
 *      centres within the slot.
 *   2. Parent has no layout engine ⇒ the widget uses props.{width,height} and
 *      anchors with props.align + props.x/y inside the parent inner box.
 */
export function computeBox(
  widget: LvglWidget,
  parent: Box,
  slot: Box | undefined,
  styles: Record<string, StyleSpec>,
  measure?: { width: () => number; height: () => number },
): Box {
  const widthProp = resolveProp(widget, 'width', styles);
  const heightProp = resolveProp(widget, 'height', styles);
  const declaredW = sizeProp(widthProp, parent.width, measure?.width);
  const declaredH = sizeProp(heightProp, parent.height, measure?.height);
  const hasDeclaredW = widthProp != null;
  const hasDeclaredH = heightProp != null;

  if (slot) {
    const xAlignRaw = resolveProp<string>(widget, 'grid_cell_x_align', styles);
    const yAlignRaw = resolveProp<string>(widget, 'grid_cell_y_align', styles);
    const xAlign = String(xAlignRaw ?? 'STRETCH').toUpperCase();
    const yAlign = String(yAlignRaw ?? 'STRETCH').toUpperCase();
    const w = xAlign === 'STRETCH' || !hasDeclaredW ? slot.width : Math.min(slot.width, declaredW);
    const h =
      yAlign === 'STRETCH' || !hasDeclaredH ? slot.height : Math.min(slot.height, declaredH);
    const x =
      xAlign === 'STRETCH' || !hasDeclaredW
        ? slot.x
        : xAlign === 'END'
          ? slot.x + slot.width - w
          : xAlign === 'START'
            ? slot.x
            : slot.x + (slot.width - w) / 2;
    const y =
      yAlign === 'STRETCH' || !hasDeclaredH
        ? slot.y
        : yAlign === 'END'
          ? slot.y + slot.height - h
          : yAlign === 'START'
            ? slot.y
            : slot.y + (slot.height - h) / 2;
    return { x, y, width: w, height: h };
  }

  const dx = numProp(resolveProp(widget, 'x', styles), 0);
  const dy = numProp(resolveProp(widget, 'y', styles), 0);
  const alignRaw = resolveProp<string>(widget, 'align', styles);
  const align = typeof alignRaw === 'string' ? alignRaw : 'TOP_LEFT';
  const w = hasDeclaredW ? declaredW : parent.width;
  const h = hasDeclaredH ? declaredH : parent.height;
  const offset = alignChild(align, parent, { width: w, height: h }, dx, dy);
  return { x: parent.x + offset.x, y: parent.y + offset.y, width: w, height: h };
}

/** Inset an absolute box by a per-side padding amount. */
export function applyPadding(box: Box, widget: LvglWidget, styles: Record<string, StyleSpec>): Box {
  const padAll = numProp(resolveProp(widget, 'pad_all', styles), 0);
  const padTop = numProp(resolveProp(widget, 'pad_top', styles), padAll);
  const padRight = numProp(resolveProp(widget, 'pad_right', styles), padAll);
  const padBottom = numProp(resolveProp(widget, 'pad_bottom', styles), padAll);
  const padLeft = numProp(resolveProp(widget, 'pad_left', styles), padAll);
  return {
    x: box.x + padLeft,
    y: box.y + padTop,
    width: Math.max(0, box.width - padLeft - padRight),
    height: Math.max(0, box.height - padTop - padBottom),
  };
}

export function numProp(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

/**
 * Width/height resolver. Supports:
 *   - raw numbers (px)
 *   - percentage strings ("100%", "50%") resolved against `parentSize`
 *   - "SIZE_CONTENT" resolved via `measureContent` when provided — otherwise
 *     falls back to parentSize (same coarse behaviour as before the measure
 *     pass existed, so call sites without a measure callback don't regress)
 * Negative percentages clamp to 0. Malformed percentages bail to parentSize.
 */
export function sizeProp(v: unknown, parentSize: number, measureContent?: () => number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    const pct = /^(-?\d+(?:\.\d+)?)%$/.exec(trimmed);
    if (pct) return Math.max(0, (parentSize * parseFloat(pct[1])) / 100);
    if (trimmed.toUpperCase() === 'SIZE_CONTENT') {
      return measureContent ? measureContent() : parentSize;
    }
    const n = Number(trimmed);
    if (!Number.isNaN(n)) return n;
  }
  return parentSize;
}
