import type { LvglWidget } from '../parser/types';
import type { RenderContext } from './context';
import { measureFlexContent } from './layout/flex';
import { measureGridContent } from './layout/grid';
import { resolveProp } from './styles';
import { measureLabel } from './widgets/label';

/**
 * Return the intrinsic content size of `widget` — what `SIZE_CONTENT` should
 * resolve to. Also used as the fallback for undeclared width/height during
 * measure (LVGL treats missing size on a container as SIZE_CONTENT when the
 * parent has a layout engine; we mirror that for measurement purposes).
 *
 * Children with percentage sizes contribute 0 during measure: their size is
 * parent-relative and we're exactly the parent whose size we're trying to
 * compute.
 */
export function measureContent(
  widget: LvglWidget,
  ctx: RenderContext,
): { width: number; height: number } {
  if (widget.type === 'label') {
    return withPadding(widget, ctx, measureLabel(widget, ctx));
  }
  return withPadding(widget, ctx, measureChildren(widget, ctx));
}

function measureChildren(widget: LvglWidget, ctx: RenderContext): { width: number; height: number } {
  if (widget.children.length === 0) return { width: 0, height: 0 };

  const childSizes = widget.children.map((c) => measureChildIntrinsic(c, ctx));

  if (widget.layout?.kind === 'flex') {
    return measureFlexContent(widget.layout.spec, childSizes);
  }
  if (widget.layout?.kind === 'grid') {
    return measureGridContent(widget.layout.spec, widget.children, childSizes);
  }

  // No layout engine → bounding box of absolutely positioned children. Each
  // child's LVGL `align:` tells us how its position scales with the parent's
  // size; for SIZE_CONTENT purposes that translates into a minimum parent
  // extent that still keeps the child inside. A CENTER child at `y: 30` needs
  // a parent at least `2*30 + child_height` tall for its bottom edge to fit.
  let w = 0;
  let h = 0;
  for (let i = 0; i < widget.children.length; i++) {
    const child = widget.children[i];
    const size = childSizes[i];
    const styles = ctx.project.styles;
    const align = String(resolveProp(child, 'align', styles) ?? 'TOP_LEFT').toUpperCase();
    const { hAnchor, vAnchor } = anchorsOf(align);
    const dx = numProp(resolveProp(child, 'x', styles), 0);
    const dy = numProp(resolveProp(child, 'y', styles), 0);
    w = Math.max(w, extentFor(hAnchor, dx, size.width));
    h = Math.max(h, extentFor(vAnchor, dy, size.height));
  }
  return { width: w, height: h };
}

type Anchor = 'start' | 'mid' | 'end';

function extentFor(anchor: Anchor, offset: number, childSize: number): number {
  switch (anchor) {
    case 'start': return Math.max(0, offset + childSize);
    case 'mid':   return 2 * Math.abs(offset) + childSize;
    case 'end':   return Math.max(0, childSize - offset);
  }
}

function anchorsOf(align: string): { hAnchor: Anchor; vAnchor: Anchor } {
  switch (align) {
    case 'TOP_LEFT':     return { hAnchor: 'start', vAnchor: 'start' };
    case 'TOP_MID':      return { hAnchor: 'mid',   vAnchor: 'start' };
    case 'TOP_RIGHT':    return { hAnchor: 'end',   vAnchor: 'start' };
    case 'LEFT_MID':     return { hAnchor: 'start', vAnchor: 'mid' };
    case 'CENTER':       return { hAnchor: 'mid',   vAnchor: 'mid' };
    case 'RIGHT_MID':    return { hAnchor: 'end',   vAnchor: 'mid' };
    case 'BOTTOM_LEFT':  return { hAnchor: 'start', vAnchor: 'end' };
    case 'BOTTOM_MID':   return { hAnchor: 'mid',   vAnchor: 'end' };
    case 'BOTTOM_RIGHT': return { hAnchor: 'end',   vAnchor: 'end' };
    // OUT_* anchors position the child outside the parent — they shouldn't
    // contribute to the parent's content extent.
    default:             return { hAnchor: 'start', vAnchor: 'start' };
  }
}

/**
 * A child's contribution to its parent's content size. Percentage and
 * undeclared sizes resolve to 0 here (they depend on the parent, which is
 * exactly what we're trying to compute); explicit SIZE_CONTENT recurses.
 */
function measureChildIntrinsic(
  widget: LvglWidget,
  ctx: RenderContext,
): { width: number; height: number } {
  const styles = ctx.project.styles;
  const wProp = resolveProp(widget, 'width', styles);
  const hProp = resolveProp(widget, 'height', styles);
  const content = () => measureContent(widget, ctx);
  return {
    width: dimForMeasure(wProp, () => content().width),
    height: dimForMeasure(hProp, () => content().height),
  };
}

function dimForMeasure(v: unknown, contentFn: () => number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.toUpperCase() === 'SIZE_CONTENT') return contentFn();
    if (/^-?\d+(?:\.\d+)?%$/.test(t)) return 0;
    const n = Number(t);
    if (!Number.isNaN(n)) return n;
  }
  return contentFn();
}

function withPadding(
  widget: LvglWidget,
  ctx: RenderContext,
  size: { width: number; height: number },
): { width: number; height: number } {
  const styles = ctx.project.styles;
  const padAll = numProp(resolveProp(widget, 'pad_all', styles), 0);
  const padLeft = numProp(resolveProp(widget, 'pad_left', styles), padAll);
  const padRight = numProp(resolveProp(widget, 'pad_right', styles), padAll);
  const padTop = numProp(resolveProp(widget, 'pad_top', styles), padAll);
  const padBottom = numProp(resolveProp(widget, 'pad_bottom', styles), padAll);
  return {
    width: size.width + padLeft + padRight,
    height: size.height + padTop + padBottom,
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
