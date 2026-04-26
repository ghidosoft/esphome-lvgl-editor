import type { LvglWidget, StyleSpec } from '../parser/types';
import { alignChild } from './align';
import { resolveProp } from './styles';
import type { Box } from './context';
import type { DefaultTheme } from './defaultTheme';

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
  theme?: DefaultTheme,
): Box {
  const widthProp = resolveProp(widget, 'width', styles, theme);
  const heightProp = resolveProp(widget, 'height', styles, theme);
  const declaredW = sizeProp(widthProp, parent.width, measure?.width);
  const declaredH = sizeProp(heightProp, parent.height, measure?.height);
  const hasDeclaredW = widthProp != null;
  const hasDeclaredH = heightProp != null;

  if (slot) {
    const xAlignRaw = resolveProp<string>(widget, 'grid_cell_x_align', styles, theme);
    const yAlignRaw = resolveProp<string>(widget, 'grid_cell_y_align', styles, theme);
    const xAlign = String(xAlignRaw ?? 'STRETCH').toUpperCase();
    const yAlign = String(yAlignRaw ?? 'STRETCH').toUpperCase();
    // STRETCH always fills the cell. For other alignments, use the declared
    // size or — when undeclared — the intrinsic content size (LVGL's
    // SIZE_CONTENT default). Without this fallback, alignment changes would
    // be invisible whenever the child has no explicit width/height.
    const intrinsicW = measure?.width ? measure.width() : slot.width;
    const intrinsicH = measure?.height ? measure.height() : slot.height;
    const w =
      xAlign === 'STRETCH'
        ? slot.width
        : Math.min(slot.width, hasDeclaredW ? declaredW : intrinsicW);
    const h =
      yAlign === 'STRETCH'
        ? slot.height
        : Math.min(slot.height, hasDeclaredH ? declaredH : intrinsicH);
    const x =
      xAlign === 'STRETCH'
        ? slot.x
        : xAlign === 'END'
          ? slot.x + slot.width - w
          : xAlign === 'START'
            ? slot.x
            : slot.x + (slot.width - w) / 2;
    const y =
      yAlign === 'STRETCH'
        ? slot.y
        : yAlign === 'END'
          ? slot.y + slot.height - h
          : yAlign === 'START'
            ? slot.y
            : slot.y + (slot.height - h) / 2;
    return { x, y, width: w, height: h };
  }

  const dx = numProp(resolveProp(widget, 'x', styles, theme), 0);
  const dy = numProp(resolveProp(widget, 'y', styles, theme), 0);
  const alignRaw = resolveProp<string>(widget, 'align', styles, theme);
  const align = typeof alignRaw === 'string' ? alignRaw : 'TOP_LEFT';
  const w = hasDeclaredW ? declaredW : parent.width;
  const h = hasDeclaredH ? declaredH : parent.height;
  const offset = alignChild(align, parent, { width: w, height: h }, dx, dy);
  return { x: parent.x + offset.x, y: parent.y + offset.y, width: w, height: h };
}

/** Inset an absolute box by a per-side padding amount. */
export function applyPadding(
  box: Box,
  widget: LvglWidget,
  styles: Record<string, StyleSpec>,
  theme?: DefaultTheme,
): Box {
  const padAll = numProp(resolveProp(widget, 'pad_all', styles, theme), 0);
  const padTop = numProp(resolveProp(widget, 'pad_top', styles, theme), padAll);
  const padRight = numProp(resolveProp(widget, 'pad_right', styles, theme), padAll);
  const padBottom = numProp(resolveProp(widget, 'pad_bottom', styles, theme), padAll);
  const padLeft = numProp(resolveProp(widget, 'pad_left', styles, theme), padAll);
  return {
    x: box.x + padLeft,
    y: box.y + padTop,
    width: Math.max(0, box.width - padLeft - padRight),
    height: Math.max(0, box.height - padTop - padBottom),
  };
}

/**
 * Inner-content box: outer box minus border and padding. Used by leaf
 * renderers (label, image, etc.) to position their own content the same way
 * LVGL does — outer box draws background+border, inner box receives the text
 * or image. CanvasStage computes the equivalent for child layout slots, but
 * leaf widgets that don't have children must apply this themselves.
 */
export function contentBox(
  box: Box,
  widget: LvglWidget,
  styles: Record<string, StyleSpec>,
  theme?: DefaultTheme,
): Box {
  const borderWidth = numProp(resolveProp(widget, 'border_width', styles, theme), 0);
  const afterBorder: Box = {
    x: box.x + borderWidth,
    y: box.y + borderWidth,
    width: Math.max(0, box.width - 2 * borderWidth),
    height: Math.max(0, box.height - 2 * borderWidth),
  };
  return applyPadding(afterBorder, widget, styles, theme);
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
